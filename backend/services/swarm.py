"""Documented swarm groups and cautious density-based swarm candidates."""
import unicodedata
from collections import defaultdict
from datetime import timedelta

from .classification import haversine_km, parse_utc

METHOD = 'spatiotemporal-swarm-screen-v2'
CHAPARRAL_METHOD = 'chaparral-sequence-screen-v1'
CHOCO_METHOD = 'sgc-choco-swarm-screen-v1'

MAX_LINK_KM = 10.0
MAX_LINK_DAYS = 5
MIN_BURST_EVENTS = 20
MIN_SPAN = timedelta(hours=48)
MAX_TOP_MAGNITUDE_GAP = 1.2


def _normal(value):
    value = unicodedata.normalize('NFKD', str(value or ''))
    return ''.join(char for char in value if not unicodedata.combining(char)).lower()


def _documented_group(event):
    """Use the SGC-documented regions/sequences, with their spatial and depth context."""
    when = parse_utc(event.get('occurred_at'))
    if when is None:
        return None
    try:
        lat, lon = float(event['latitude']), float(event['longitude'])
        depth = float(event['depth_km'])
    except (TypeError, ValueError, KeyError):
        return None

    # Chaparral sequence documented by the SGC as starting on 20 Sep 2026.
    if (when >= parse_utc('2026-09-20T00:00:00Z') and depth <= 30 and
            haversine_km(lat, lon, 3.84, -75.62) <= 18):
        return 'SWARM', CHAPARRAL_METHOD

    # SGC separates this Chocó swarm from the deeper aftershock group by region and depth.
    department = _normal(event.get('department'))
    municipality = _normal(event.get('municipality'))
    choco_area = any(name in municipality for name in (
        'istmina', 'medio san juan', 'sipi', 'litoral del san juan'
    ))
    if department == 'choco' and choco_area and 30 <= depth <= 70:
        return 'SWARM', CHOCO_METHOD
    return None


def _candidate_cluster_ids(events):
    """Flag probable clusters; fixed-radius neighborhoods prevent chain-linking regions."""
    usable = []
    for event in events:
        when = parse_utc(event.get('occurred_at'))
        try:
            lat, lon = float(event['latitude']), float(event['longitude'])
            magnitude = float(event['magnitude'])
        except (TypeError, ValueError, KeyError):
            continue
        if when is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
            usable.append({**event, '_when': when, '_lat': lat, '_lon': lon, '_mag': magnitude})
    usable.sort(key=lambda item: item['_when'])
    candidates = set()
    max_span = timedelta(days=MAX_LINK_DAYS)

    for anchor in usable:
        neighborhood = [
            event for event in usable
            if abs(event['_when'] - anchor['_when']) <= max_span and
            haversine_km(anchor['_lat'], anchor['_lon'], event['_lat'], event['_lon']) <= MAX_LINK_KM
        ]
        if len(neighborhood) < MIN_BURST_EVENTS:
            continue
        neighborhood.sort(key=lambda item: item['_when'])
        if neighborhood[-1]['_when'] - neighborhood[0]['_when'] < MIN_SPAN:
            continue
        mags = sorted((item['_mag'] for item in neighborhood), reverse=True)
        if len(mags) > 1 and mags[0] - mags[1] > MAX_TOP_MAGNITUDE_GAP:
            continue

        left = 0
        dense = False
        for right, event in enumerate(neighborhood):
            while event['_when'] - neighborhood[left]['_when'] > timedelta(hours=24):
                left += 1
            if right - left + 1 >= MIN_BURST_EVENTS:
                dense = True
                break
        if dense:
            candidates.update(item['id'] for item in neighborhood)
    return candidates


def reclassify_swarms(conn):
    """Set documented swarm groups and separate machine-detected candidates."""
    rows = conn.execute(
        "SELECT id,occurred_at,magnitude,depth_km,latitude,longitude,municipality,department "
        "FROM seismic_events WHERE earthquake_id IS NULL "
        "AND association_status IN ('UNASSOCIATED','SWARM','POSSIBLE_SWARM')"
    ).fetchall()
    events = [dict(row) for row in rows]
    candidates = _candidate_cluster_ids(events)
    documented = {}
    for event in events:
        group = _documented_group(event)
        if group:
            documented[event['id']] = group

    for row in rows:
        if row['id'] in documented:
            status, method = documented[row['id']]
        elif row['id'] in candidates:
            status, method = 'POSSIBLE_SWARM', METHOD
        else:
            status, method = 'UNASSOCIATED', 'gardner-knopoff-screen-v2'
        conn.execute(
            'UPDATE seismic_events SET association_status=?, classification_method=? WHERE id=?',
            (status, method, row['id'])
        )
    conn.commit()
    return {'documented': len(documented), 'possible': len(candidates - set(documented))}
