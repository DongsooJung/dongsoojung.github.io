import importlib.util,tempfile,unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('gap',Path(__file__).parents[1]/'exchange-rate/fetch_rate_gap.py')
gap=importlib.util.module_from_spec(spec);spec.loader.exec_module(gap)
class FrozenDate(date):
    @classmethod
    def today(cls):return cls(2026,10,24)

class RateGapSources(unittest.TestCase):
    def setUp(self):
        self.clock=patch.object(gap,'date',FrozenDate);self.clock.start();self.addCleanup(self.clock.stop)
    def test_bad_headers_dates_duplicates_nonfinite_rejected(self):
        for text in ['date,X\n2026-01-01,3\n','observation_date,X\n2026-01-02,3\n','observation_date,X\n2026-01-01,3\n2026-01-01,4\n','observation_date,X\n2026-01-01,nan\n','observation_date,X\n2027-01-01,3\n']:
            with self.assertRaises(ValueError):gap.parse_series(text,'X',date(1996,10,1),date(2026,10,24))
    def test_missing_month_does_not_write_partial_history(self):
        months=list(gap.month_sequence('1996-10','2026-09'));kr={m:3.044 for m in months};us={m:3.75 for m in months};del kr['2010-01']
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'rate_gap.json';p.write_bytes(b'original snapshot')
            with patch.object(gap,'DATA_PATH',p),patch.object(gap,'fetch_series',side_effect=[kr,us]):self.assertEqual(gap.main(),1)
            self.assertEqual(p.read_bytes(),b'original snapshot')
    def test_outage_preserves_data_and_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'rate_gap.json';p.write_bytes(b'old data');fallback=p.with_name('rate-gap-fallback.js');fallback.write_bytes(b'old fallback')
            with patch.object(gap,'DATA_PATH',p),patch.object(gap,'fetch_series',side_effect=TimeoutError):self.assertEqual(gap.main(),1)
            self.assertEqual(p.read_bytes(),b'old data');self.assertEqual(fallback.read_bytes(),b'old fallback')
    def test_percentage_point_difference_and_period_metadata(self):
        months=list(gap.month_sequence('1996-10','2026-09'));kr={m:3.044 for m in months};us={m:3.75 for m in months}
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'rate_gap.json'
            with patch.object(gap,'DATA_PATH',p),patch.object(gap,'fetch_series',side_effect=[kr,us]):self.assertEqual(gap.main(),0)
            import json
            result=json.loads(p.read_text())
            self.assertEqual(result['series'][-1]['gap'],-.706);self.assertEqual(result['observedAt'],'2026-09');self.assertIsNone(result['sourceObservationTime']);self.assertEqual(result['coverage']['months'],360)

if __name__=='__main__':unittest.main()
