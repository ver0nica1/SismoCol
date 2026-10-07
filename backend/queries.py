"""Consultas compartidas por la API local (backend/main.py) y la exportación estática."""
from backend.database.db import rows

EVENTS_SQL = ("SELECT e.id,e.event_id,e.occurred_at,e.magnitude,e.depth_km,e.latitude,e.longitude,"
              "e.municipality,e.department,e.event_type,e.association_status,e.earthquake_id,"
              "e.association_distance_km,e.association_time_days,e.depth_difference_km,"
              "e.classification_method,s.name source "
              "FROM seismic_events e LEFT JOIN sources s ON s.id=e.source_id")

SCOPES = {
    None: '',
    'earthquake': ' WHERE e.earthquake_id IS NOT NULL',
    'general': ' WHERE e.earthquake_id IS NULL',
}

QUERIES = {
    'news': "SELECT n.*,s.name source FROM news_articles n LEFT JOIN sources s ON s.id=n.source_id ORDER BY n.published_at DESC,n.extracted_at DESC",
    'affectations': "SELECT i.*,s.name source,n.title,n.url FROM impact_reports i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN news_articles n ON n.id=i.article_id ORDER BY i.reported_at DESC",
    'timeline': "SELECT balance_date,MAX(deceased) deceased,MAX(injured) injured,MAX(missing) missing,MAX(affected) affected FROM impact_reports WHERE balance_date IS NOT NULL GROUP BY balance_date ORDER BY balance_date",
    'cities': "SELECT c.id,c.name,c.department,c.latitude,c.longitude,MAX(ci.deceased) deceased,MAX(ci.injured) injured,MAX(ci.missing) missing,MAX(ci.affected) affected,MAX(ci.homes_affected) homes_affected FROM cities c LEFT JOIN city_impacts ci ON ci.city_id=c.id GROUP BY c.id ORDER BY c.name",
    'city-timeline': "SELECT c.name city,n.published_at balance_date,ci.deceased,ci.injured,ci.missing FROM city_impacts ci JOIN cities c ON c.id=ci.city_id JOIN impact_reports r ON r.id=ci.report_id JOIN news_articles n ON n.id=r.article_id WHERE n.published_at IS NOT NULL ORDER BY n.published_at,c.name",
    'monthly-stats': "SELECT * FROM monthly_stats ORDER BY month, department",
}


def events(conn, scope=None):
    return rows(conn, EVENTS_SQL + SCOPES.get(scope, '') + ' ORDER BY e.occurred_at DESC')


def summary(conn):
    eq = conn.execute('SELECT * FROM earthquakes WHERE id=1').fetchone()
    candidates = conn.execute(
        "SELECT COUNT(*) n, MAX(magnitude) m FROM seismic_events "
        "WHERE earthquake_id=1 AND association_status='CANDIDATE_AFTERSHOCK'").fetchone()
    report = conn.execute('SELECT * FROM impact_reports ORDER BY reported_at DESC LIMIT 1').fetchone()
    return {
        'earthquake': dict(eq) if eq else None,
        'candidate_aftershocks': candidates['n'],
        'max_candidate_aftershock': candidates['m'],
        'latest_report': dict(report) if report else None,
    }


def dataset(conn, name):
    if name == 'summary':
        return summary(conn)
    if name == 'events':
        return events(conn)
    return rows(conn, QUERIES[name])


DATASETS = ['summary', 'events', *QUERIES.keys()]
