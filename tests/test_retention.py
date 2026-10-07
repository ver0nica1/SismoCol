import csv, gzip, sqlite3, tempfile, unittest
from datetime import date
from pathlib import Path

from backend.database.db import ROOT
from backend.services.retention import keep_from, run_cleanup
from backend.services.sync import upsert_events

TODAY = date(2026, 10, 4)   # keep_from(24) -> 2024-10-01
MAINSHOCK = {'id': 1, 'occurred_at': '2026-08-10 12:34:27', 'latitude': 4.991, 'longitude': -76.292, 'magnitude': 7.4}


def make_conn():
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript((ROOT / 'schema.sql').read_text(encoding='utf-8'))
    conn.execute("INSERT INTO sources(id,name,source_type) VALUES(1,'SGC','official')")
    conn.execute("INSERT INTO earthquakes(id,name,updated_at) VALUES(1,'T','now')")
    return conn


def insert(conn, event_id, occurred_at, magnitude, earthquake_id=None, association_status='UNASSOCIATED', department='Santander'):
    conn.execute(
        'INSERT INTO seismic_events(event_id,occurred_at,magnitude,depth_km,latitude,longitude,department,event_type,association_status,earthquake_id,classification_method) '
        "VALUES(?,?,?,10,6.8,-73.1,?,'SISMO',?,?, 'test')",
        (event_id, occurred_at, magnitude, department, association_status, earthquake_id))


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.tmp = tempfile.TemporaryDirectory()
        insert(self.conn, 'old-general', '2024-05-10 00:00:00', 3.5)
        insert(self.conn, 'old-general-2', '2024-09-30 23:59:59', 4.2)
        insert(self.conn, 'recent-general', '2026-09-01 00:00:00', 3.0)
        insert(self.conn, 'recent-small', '2026-09-02 00:00:00', 1.8)
        insert(self.conn, 'replica-small', '2026-08-11 00:00:00', 1.5, 1, 'CANDIDATE_AFTERSHOCK', 'Chocó')
        insert(self.conn, 'replica-old', '2024-01-01 00:00:00', 3.0, 1, 'CANDIDATE_AFTERSHOCK', 'Chocó')  # protegido aunque sea viejo
        self.conn.commit()

    def tearDown(self):
        self.tmp.cleanup()

    def ids(self):
        return {r[0] for r in self.conn.execute('SELECT event_id FROM seismic_events')}

    def test_keep_from_is_month_aligned(self):
        self.assertEqual(keep_from(24, TODAY), '2024-10-01')
        self.assertEqual(keep_from(12, date(2026, 1, 15)), '2025-01-01')

    def test_deletes_old_and_small_general_events_only(self):
        r = run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, today=TODAY)
        self.assertEqual(r['to_delete'], 3)
        self.assertEqual(self.ids(), {'recent-general', 'replica-small', 'replica-old'})

    def test_never_deletes_earthquake_events(self):
        run_cleanup(self.conn, months=1, min_magnitude=9.0, archive_dir=self.tmp.name, today=TODAY)
        self.assertEqual(self.ids(), {'replica-small', 'replica-old'})

    def test_dry_run_changes_nothing(self):
        before = self.ids()
        r = run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, dry_run=True, today=TODAY)
        self.assertEqual(r['to_delete'], 3)
        self.assertEqual(self.ids(), before)
        self.assertEqual(list(Path(self.tmp.name).glob('*.csv.gz')), [])
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM monthly_stats').fetchone()[0], 0)

    def test_archive_contains_exactly_deleted_rows_without_duplicates(self):
        run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, today=TODAY)
        run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, today=TODAY)
        archived = {}
        for path in Path(self.tmp.name).glob('sismos_*.csv.gz'):
            with gzip.open(path, 'rt', encoding='utf-8') as fh:
                archived[path.name] = [row['event_id'] for row in csv.DictReader(fh)]
        self.assertEqual(sorted(archived), ['sismos_2024.csv.gz', 'sismos_2026.csv.gz'])
        self.assertEqual(sorted(archived['sismos_2024.csv.gz']), ['old-general', 'old-general-2'])
        self.assertEqual(archived['sismos_2026.csv.gz'], ['recent-small'])

    def test_monthly_stats_survive_deletion(self):
        run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, today=TODAY)
        stats = {(r['month'], r['department']): dict(r) for r in self.conn.execute('SELECT * FROM monthly_stats')}
        self.assertEqual(stats[('2026-09', 'Santander')]['total_events'], 1)   # el M1.8 no cuenta
        self.assertNotIn(('2026-08', 'Chocó'), stats)                          # réplica M1.5 < filtro
        # Al día siguiente, con menos detalle, el mes conservado no pierde datos.
        run_cleanup(self.conn, months=24, min_magnitude=2.5, archive_dir=self.tmp.name, today=TODAY)
        self.assertEqual(self.conn.execute(
            "SELECT total_events FROM monthly_stats WHERE month='2026-09'").fetchone()[0], 1)


class UpsertTest(unittest.TestCase):
    def test_filters_unassociated_events_but_keeps_candidates(self):
        conn = make_conn()
        events = [
            {'event_id': 'g-small', 'occurred_at': '2026-09-01 00:00:00', 'latitude': 6.8, 'longitude': -73.1, 'magnitude': 1.9},
            {'event_id': 'g-big', 'occurred_at': '2026-09-01 00:00:00', 'latitude': 6.8, 'longitude': -73.1, 'magnitude': 3.1},
            {'event_id': 'r-small', 'occurred_at': '2026-09-01 00:00:00', 'latitude': 4.95, 'longitude': -76.3, 'magnitude': 1.2},
        ]
        self.assertEqual(upsert_events(conn, events, 1, min_magnitude=2.5, mainshock=MAINSHOCK), 2)
        rows = {r['event_id']: dict(r) for r in conn.execute('SELECT * FROM seismic_events')}
        self.assertEqual(set(rows), {'g-big', 'r-small'})
        self.assertIsNone(rows['g-big']['earthquake_id'])
        self.assertIsNone(rows['g-big']['raw_payload'])
        self.assertEqual(rows['r-small']['earthquake_id'], 1)
        self.assertIsNotNone(rows['r-small']['raw_payload'])


if __name__ == '__main__': unittest.main()
