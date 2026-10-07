"""Conservative association screening for the configured mainshock.

Gardner–Knopoff windows are used only to flag candidate associations. They do not
prove that an earthquake is an aftershock, and events outside the window are not
automatically a swarm or proven independent.
"""
import math
from datetime import datetime, timezone

METHOD = 'gardner-knopoff-screen-v2'
MAIN = 'MAINSHOCK'
CANDIDATE = 'CANDIDATE_AFTERSHOCK'
UNASSOCIATED = 'UNASSOCIATED'
INSUFFICIENT_DATA = 'INSUFFICIENT_DATA'
EVENT = 'SISMO'

MAIN_TOLERANCE_SECONDS = 90
MAIN_TOLERANCE_KM = 15

DEFAULT_MAINSHOCK = {
    'id': 1, 'occurred_at': '2026-08-10 12:34:27',
    'latitude': 4.991, 'longitude': -76.292, 'depth_km': 103.41, 'magnitude': 7.4,
}


def gk_distance_km(magnitude):
    return 10 ** (0.1238 * magnitude + 0.983)


def gk_time_days(magnitude):
    if magnitude >= 6.5:
        return 10 ** (0.032 * magnitude + 2.7389)
    return 10 ** (0.5409 * magnitude - 0.547)


def parse_utc(value):
    """Parse catalog timestamps; naive catalog values are defined as UTC."""
    if not value:
        return None
    text = str(value).strip().replace('Z', '+00:00')
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _number(value):
    try:
        number = None if value is None or value == '' else float(str(value).replace(',', '.'))
        return number if number is not None and math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(min(1, a)))


def _result(status, earthquake_id=None, distance_km=None, time_days=None, depth_difference_km=None):
    return {
        'event_type': EVENT,
        'association_status': status,
        'earthquake_id': earthquake_id,
        'classification_method': METHOD,
        'association_distance_km': distance_km,
        'association_time_days': time_days,
        'depth_difference_km': depth_difference_km,
    }


def load_mainshock(conn):
    """Read the configured mainshock from the event catalog when available."""
    main = dict(DEFAULT_MAINSHOCK)
    row = conn.execute(
        "SELECT occurred_at, latitude, longitude, depth_km, magnitude FROM seismic_events "
        "WHERE association_status='MAINSHOCK' AND earthquake_id=1 "
        'ORDER BY magnitude DESC LIMIT 1'
    ).fetchone()
    if row and row[0] and row[1] is not None and row[2] is not None:
        main.update(occurred_at=row[0], latitude=row[1], longitude=row[2], depth_km=row[3],
                    magnitude=row[4] if row[4] is not None else main['magnitude'])
    return main


def classify(event, mainshock=None):
    """Return a cautious sequence association, not a definitive event diagnosis."""
    main = mainshock or DEFAULT_MAINSHOCK
    t = parse_utc(event.get('occurred_at'))
    lat, lon = _number(event.get('latitude')), _number(event.get('longitude'))
    t0 = parse_utc(main.get('occurred_at'))
    main_lat, main_lon = _number(main.get('latitude')), _number(main.get('longitude'))
    m0, magnitude = _number(main.get('magnitude')), _number(event.get('magnitude'))

    if (t is None or t0 is None or lat is None or lon is None or
            main_lat is None or main_lon is None or m0 is None or
            not -90 <= lat <= 90 or not -180 <= lon <= 180 or
            not -90 <= main_lat <= 90 or not -180 <= main_lon <= 180):
        return _result(INSUFFICIENT_DATA)

    seconds = (t - t0).total_seconds()
    distance = haversine_km(lat, lon, main_lat, main_lon)
    event_depth, main_depth = _number(event.get('depth_km')), _number(main.get('depth_km'))
    if event_depth is not None and not 0 <= event_depth <= 700:
        event_depth = None
    if main_depth is not None and not 0 <= main_depth <= 700:
        main_depth = None
    depth_difference = abs(event_depth - main_depth) if event_depth is not None and main_depth is not None else None
    measurements = {
        'distance_km': round(distance, 2),
        'time_days': round(seconds / 86400, 4),
        'depth_difference_km': round(depth_difference, 2) if depth_difference is not None else None,
    }

    if (abs(seconds) <= MAIN_TOLERANCE_SECONDS and distance <= MAIN_TOLERANCE_KM
            and magnitude is not None and magnitude >= m0 - 0.5):
        return _result(MAIN, main.get('id', 1), **measurements)

    if magnitude is None:
        return _result(INSUFFICIENT_DATA, **measurements)

    if seconds <= 0 or magnitude >= m0:
        return _result(UNASSOCIATED, **measurements)

    if seconds <= gk_time_days(m0) * 86400 and distance <= gk_distance_km(m0):
        return _result(CANDIDATE, main.get('id', 1), **measurements)

    return _result(UNASSOCIATED, **measurements)
