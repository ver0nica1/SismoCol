import json
from backend import config
from .classification import CANDIDATE, MAIN, classify, load_mainshock
from .swarm import reclassify_swarms
from .validation import validate_event


def _below_min(event, min_magnitude):
    magnitude = event.get('magnitude')
    return magnitude is None or float(magnitude) < min_magnitude


def upsert_events(conn, events, source_id, min_magnitude=None, mainshock=None):
    """Clasifica e inserta eventos de forma idempotente (por event_id).

    - Principal y candidatos asociados: se guardan siempre, con raw_payload.
    - Sismos generales: solo si magnitud >= min_magnitude, sin raw_payload.
    """
    min_magnitude = config.min_magnitude() if min_magnitude is None else min_magnitude
    mainshock = mainshock or load_mainshock(conn)
    inserted = 0
    for event in events:
        event.update(classify(event, mainshock))
        if validate_event(event): continue
        related = event['association_status'] in (MAIN, CANDIDATE)
        exists = conn.execute('SELECT 1 FROM seismic_events WHERE event_id=?', (event['event_id'],)).fetchone()
        if not related and not exists and _below_min(event, min_magnitude):
            continue
        payload = json.dumps(event, ensure_ascii=False) if related else None
        conn.execute(
            "INSERT INTO seismic_events(event_id,occurred_at,magnitude,depth_km,latitude,longitude,"
            "municipality,department,event_type,association_status,association_distance_km,association_time_days,"
            "depth_difference_km,source_id,earthquake_id,raw_payload,classification_method) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET "
            "occurred_at=excluded.occurred_at,magnitude=excluded.magnitude,depth_km=excluded.depth_km,"
            "latitude=excluded.latitude,longitude=excluded.longitude,municipality=excluded.municipality,"
            "department=excluded.department,event_type=excluded.event_type,"
            "association_status=excluded.association_status,source_id=excluded.source_id,"
            "association_distance_km=excluded.association_distance_km,"
            "association_time_days=excluded.association_time_days,depth_difference_km=excluded.depth_difference_km,"
            "earthquake_id=excluded.earthquake_id,raw_payload=excluded.raw_payload,"
            "classification_method=excluded.classification_method",
            (event['event_id'], event.get('occurred_at'), event.get('magnitude'), event.get('depth_km'),
             event.get('latitude'), event.get('longitude'), event.get('municipality'), event.get('department'),
             event['event_type'], event['association_status'], event['association_distance_km'],
             event['association_time_days'], event['depth_difference_km'], source_id, event['earthquake_id'], payload,
             event['classification_method']))
        inserted += int(not exists)
    conn.commit()
    reclassify_swarms(conn)
    return inserted


def reclassify_events(conn, only_missing=True):
    """Actualiza el estado de asociación con el criterio vigente."""
    mainshock = load_mainshock(conn)
    where = 'WHERE classification_method IS NULL' if only_missing else ''
    rows = conn.execute(f'SELECT id,occurred_at,latitude,longitude,magnitude,depth_km FROM seismic_events {where}').fetchall()
    for row in rows:
        result = classify({'occurred_at': row[1], 'latitude': row[2], 'longitude': row[3],
                           'magnitude': row[4], 'depth_km': row[5]}, mainshock)
        conn.execute(
            'UPDATE seismic_events SET event_type=?, association_status=?, earthquake_id=?, '
            'association_distance_km=?, association_time_days=?, depth_difference_km=?, classification_method=?, '
            'raw_payload=CASE WHEN ? IS NULL THEN NULL ELSE raw_payload END WHERE id=?',
            (result['event_type'], result['association_status'], result['earthquake_id'],
             result['association_distance_km'], result['association_time_days'], result['depth_difference_km'],
             result['classification_method'], result['earthquake_id'], row[0]))
    conn.commit(); return len(rows)
