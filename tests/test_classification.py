import unittest
from backend.services.classification import (CANDIDATE, INSUFFICIENT_DATA, MAIN, UNASSOCIATED,
                                              classify, gk_distance_km, gk_time_days, parse_utc)

MAINSHOCK = {'id': 1, 'occurred_at': '2026-08-10 12:34:27', 'latitude': 4.991, 'longitude': -76.292, 'magnitude': 7.4}


def event(occurred_at, lat, lon, magnitude=3.0):
    return {'occurred_at': occurred_at, 'latitude': lat, 'longitude': lon, 'magnitude': magnitude}


class ClassificationTest(unittest.TestCase):
    def test_windows_for_m74(self):
        self.assertAlmostEqual(gk_distance_km(7.4), 79, delta=1)
        self.assertAlmostEqual(gk_time_days(7.4), 946, delta=5)

    def test_main_shock(self):
        r = classify(event('2026-08-10 12:34:27', 4.991, -76.292, 7.4), MAINSHOCK)
        self.assertEqual((r['association_status'], r['earthquake_id']), (MAIN, 1))

    def test_near_replica(self):
        r = classify(event('2026-08-10 15:01:31', 4.85, -76.37, 3.8), MAINSHOCK)
        self.assertEqual((r['association_status'], r['earthquake_id']), (CANDIDATE, 1))

    def test_small_replica_is_still_replica(self):
        r = classify(event('2026-09-01 00:00:00', 5.0, -76.3, 1.2), MAINSHOCK)
        self.assertEqual(r['association_status'], CANDIDATE)

    def test_far_event(self):
        r = classify(event('2026-08-10 15:01:31', 6.8, -73.1, 3.8), MAINSHOCK)
        self.assertEqual((r['association_status'], r['earthquake_id']), (UNASSOCIATED, None))

    def test_near_but_three_years_later_is_not_replica(self):
        r = classify(event('2029-09-01 10:00:00', 4.95, -76.30), MAINSHOCK)
        self.assertEqual((r['association_status'], r['earthquake_id']), (UNASSOCIATED, None))

    def test_near_but_before_main_is_not_replica(self):
        r = classify(event('2026-08-10 06:00:00', 4.95, -76.30), MAINSHOCK)
        self.assertEqual(r['association_status'], UNASSOCIATED)

    def test_local_time_of_main_is_not_confused_with_utc(self):
        # 07:34 es la hora local (COT); el catálogo usa UTC (12:34). 07:34 UTC es ANTERIOR al principal.
        r = classify(event('2026-08-10 07:34:00', 4.991, -76.292, 7.4), MAINSHOCK)
        self.assertEqual(r['association_status'], UNASSOCIATED)

    def test_missing_coordinates(self):
        self.assertEqual(classify({'occurred_at': '2026-08-11 00:00:00'}, MAINSHOCK)['association_status'], INSUFFICIENT_DATA)

    def test_parse_utc_formats(self):
        self.assertIsNotNone(parse_utc('2026-08-10 12:34:27'))
        self.assertIsNotNone(parse_utc('2026-08-10T12:34'))
        self.assertIsNone(parse_utc('no es fecha'))


if __name__ == '__main__': unittest.main()
