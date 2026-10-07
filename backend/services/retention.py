"""Retención de datos: resumen mensual permanente, respaldo CSV anual y borrado del detalle viejo.

Reglas:
- Los eventos asociados al terremoto (earthquake_id NOT NULL) nunca se borran.
- Los sismos generales se conservan durante `months` meses completos (corte alineado al mes,
  para que el resumen mensual de un mes cerrado no se recalcule con datos incompletos).
- Los sismos generales por debajo de la magnitud mínima también se eliminan.
- Todo lo que se borra se agrega antes a data/archive/sismos_AAAA.csv.gz.
"""
import csv, gzip, io
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from backend import config

ARCHIVE_COLUMNS = ['event_id', 'occurred_at', 'magnitude', 'depth_km', 'latitude', 'longitude',
                   'municipality', 'department', 'event_type', 'association_status', 'classification_method']
CANDIDATE = 'CANDIDATE_AFTERSHOCK'
FELT_MAGNITUDE = 4.0


def keep_from(months, today=None):
    """Primer día del mes que se conserva: hoy menos `months` meses, alineado a inicio de mes."""
    today = today or datetime.now(timezone.utc).date()
    index = today.year * 12 + (today.month - 1) - months
    return date(index // 12, index % 12 + 1, 1).isoformat()


def refresh_monthly_stats(conn, since, min_magnitude):
    """Recalcula meses >= since. Los meses anteriores quedan congelados (su detalle ya no existe)."""
    conn.execute(
        """
        INSERT INTO monthly_stats(month, department, total_events, total_candidates, max_magnitude,
                                  avg_magnitude, avg_depth_km, felt_events, min_magnitude_filter, updated_at)
        SELECT substr(occurred_at, 1, 7), COALESCE(NULLIF(department, ''), 'Desconocido'),
               COUNT(*), SUM(CASE WHEN association_status = ? THEN 1 ELSE 0 END),
               MAX(magnitude), ROUND(AVG(magnitude), 2), ROUND(AVG(depth_km), 1),
               SUM(CASE WHEN magnitude >= ? THEN 1 ELSE 0 END), ?, datetime('now')
        FROM seismic_events
        WHERE occurred_at >= ? AND magnitude >= ?
        GROUP BY 1, 2
        ON CONFLICT(month, department) DO UPDATE SET
          total_events = excluded.total_events, total_candidates = excluded.total_candidates,
          max_magnitude = excluded.max_magnitude, avg_magnitude = excluded.avg_magnitude,
          avg_depth_km = excluded.avg_depth_km, felt_events = excluded.felt_events,
          min_magnitude_filter = excluded.min_magnitude_filter, updated_at = excluded.updated_at
        """,
        (CANDIDATE, FELT_MAGNITUDE, min_magnitude, since, min_magnitude))


def _deletable(conn, since, min_magnitude):
    return conn.execute(
        f"SELECT id, {', '.join(ARCHIVE_COLUMNS)} FROM seismic_events "
        "WHERE earthquake_id IS NULL AND (occurred_at < ? OR magnitude IS NULL OR magnitude < ?)",
        (since, min_magnitude)).fetchall()


def _read_archive(path):
    if not path.exists():
        return {}
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as fh:
        return {row['event_id']: row for row in csv.DictReader(fh)}


def archive_rows(rows, archive_dir):
    """Agrega filas a sismos_AAAA.csv.gz sin duplicar por event_id. Devuelve archivos tocados."""
    archive_dir = Path(archive_dir)
    by_year = defaultdict(list)
    for row in rows:
        year = (row['occurred_at'] or 'sin-fecha')[:4]
        by_year[year].append({col: row[col] for col in ARCHIVE_COLUMNS})
    touched = []
    for year, new_rows in by_year.items():
        archive_dir.mkdir(parents=True, exist_ok=True)
        path = archive_dir / f'sismos_{year}.csv.gz'
        existing = _read_archive(path)
        for row in new_rows:
            existing[row['event_id']] = row
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=ARCHIVE_COLUMNS)
        writer.writeheader()
        writer.writerows(sorted(existing.values(), key=lambda r: r['occurred_at'] or ''))
        with gzip.open(path, 'wt', encoding='utf-8', newline='') as fh:
            fh.write(buffer.getvalue())
        touched.append(str(path))
    return touched


def run_cleanup(conn, months=None, min_magnitude=None, archive_dir='data/archive', dry_run=False, today=None):
    months = config.retention_months() if months is None else months
    min_magnitude = config.min_magnitude() if min_magnitude is None else min_magnitude
    since = keep_from(months, today)
    rows = _deletable(conn, since, min_magnitude)
    result = {
        'keep_from': since, 'months': months, 'min_magnitude': min_magnitude,
        'to_delete': len(rows),
        'old': sum(1 for r in rows if (r['occurred_at'] or '') < since),
        'below_min': sum(1 for r in rows if (r['occurred_at'] or '') >= since),
        'archives': [], 'dry_run': dry_run,
    }
    if dry_run:
        return result
    try:
        refresh_monthly_stats(conn, since, min_magnitude)
        result['archives'] = archive_rows(rows, archive_dir)
        conn.executemany('DELETE FROM seismic_events WHERE id = ?', [(r['id'],) for r in rows])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return result
