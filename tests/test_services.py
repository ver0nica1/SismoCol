import unittest
from backend.services.extraction import extract_figures
from backend.services.validation import validate_event
class ServicesTest(unittest.TestCase):
    def test_figures(self):
        self.assertEqual(extract_figures('111 fallecidos, 87 heridos y 1000 afectados')['deceased'],111)
        self.assertEqual(extract_figures('sin balance')['injured'],None)
    def test_validation(self):
        self.assertIn('event_id', validate_event({'event_type':'RÉPLICA'}))
        self.assertEqual(validate_event({'event_id':'a','event_type':'RÉPLICA','magnitude':4.2}),[])
if __name__=='__main__': unittest.main()
