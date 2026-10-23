import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('bok',Path(__file__).parents[1]/'exchange-rate/fetch_bok.py')
bok=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bok)

class BokSources(unittest.TestCase):
    def test_original_failure_keeps_file_and_fallback_dates(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'bok_data.json'
            original=b'{"updatedAt":"2026-09-01","series":[]}\n'
            p.write_bytes(original)
            fallback=p.with_name('bok-fallback.js')
            fallback.write_bytes(b'original fallback')
            with patch.object(bok,'DATA_PATH',p),patch.object(bok,'fetch_stat',side_effect=TimeoutError):
                self.assertEqual(bok.main(),1)
            self.assertEqual(p.read_bytes(),original)
            self.assertEqual(fallback.read_bytes(),b'original fallback')

    def test_missing_common_month_or_lookback_is_rejected(self):
        rates={'202501':3.,'202502':3.,'202503':3.}
        for cpi in [{'202401':100.,'202402':100.,'202403':100.,'202501':102.,'202503':102.}, {'202501':102.,'202502':102.,'202503':102.}]:
            with self.assertRaises(ValueError):
                bok.build_series(rates,cpi,(2025,3),(2025,1))

    def test_decimal_yoy_and_true_period(self):
        rows=bok.build_series({'202501':3.},{'202401':100.,'202501':102.25},(2025,1),(2025,1))
        self.assertEqual(rows[0],{'ym':'2025-01','partial':False,'baseRate':3.,'cpi':102.25,'cpiRaw':102.25,'cpiPriorYearRaw':100.,'cpiYoY':2.2})
        row=bok.build_series({'202501':3.},{'202401':60.,'202501':61.765},(2025,1),(2025,1))[0]
        self.assertEqual(row['cpi'],61.76)
        self.assertEqual(row['cpiRaw'],61.765)

    def test_units_codes_duplicates_and_truncation_are_rejected(self):
        base={'STAT_CODE':'722Y001','ITEM_CODE1':'0101000','UNIT_NAME':'연%','TIME':'202501','DATA_VALUE':'3.0'}
        cases=[{'StatisticSearch':{'list_total_count':1,'row':[{**base,'UNIT_NAME':'2020=100'}]}},{'StatisticSearch':{'list_total_count':1,'row':[{**base,'STAT_CODE':'WRONG'}]}},{'StatisticSearch':{'list_total_count':2,'row':[base,base]}},{'StatisticSearch':{'list_total_count':2,'row':[base]}}]
        for payload in cases:
            with patch.object(bok.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(payload).encode())):
                with self.assertRaises(ValueError):
                    bok.fetch_stat_once('sample','722Y001','0101000','202501','202502',10)

    def test_changed_snapshot_keeps_old_verification_as_history(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'bok_data.json'
            old={'checkedAt':'2026-09-01','scope':'old values'}
            p.write_text(json.dumps({'series':[],'sourceVerification':old}))
            with patch.object(bok,'DATA_PATH',p),patch.object(bok,'fetch_stat',return_value={'202609':1.}),patch.object(bok,'build_series',return_value=[{'ym':'2026-09','baseRate':3.}]):
                self.assertEqual(bok.main(),0)
            data=json.loads(p.read_text())
            self.assertNotIn('sourceVerification',data)
            self.assertEqual(data['previousSourceVerification'],old)

if __name__=='__main__':
    unittest.main()
