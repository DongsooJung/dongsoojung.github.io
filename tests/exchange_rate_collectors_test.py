import importlib.util,tempfile,unittest,json
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def load(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'exchange-rate'/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class Collectors(unittest.TestCase):
 def test_sparse_cny_does_not_shrink_usd_day_weights(self):
  m=load('fetch_data');series,day,rates=m.aggregate({'2026-09-01':{'KRW':1500,'USD':1.2,'JPY':150,'CNY':7.5},'2026-09-02':{'KRW':1560,'USD':1.2,'JPY':156}});row=series[0];self.assertEqual(row['days'],2);self.assertEqual(row['rates']['USD']['observations'],2);self.assertEqual(row['rates']['CNY']['observations'],1);self.assertEqual(row['rates']['USD']['avg'],1275)
 def test_official_missing_cny_is_not_synthesized(self):
  m=load('fetch_data');series,_,_=m.aggregate({'2000-01-03':{'KRW':1200,'USD':1.2,'JPY':120}});self.assertNotIn('CNY',series[0]['rates'])
 def test_partial_btc_has_usdt_midrange_and_no_inferred_observed_date(self):
  m=load('fetch_bitcoin')
  class Fixed(datetime):
   @classmethod
   def now(cls,tz=None):return cls(2026,10,22,5,0,tzinfo=timezone.utc)
  start=int(datetime(2026,10,1,tzinfo=timezone.utc).timestamp()*1000);end=int(datetime(2026,11,1,tzinfo=timezone.utc).timestamp()*1000)-1
  # Decimal tie .105 must round half-even to .10, not binary-float .11.
  raw=[[start,'0.10','0.20','0.01','0.19','1',end]]
  with tempfile.TemporaryDirectory() as t,patch.object(m,'datetime',Fixed),patch.object(m,'fetch_monthly_klines',return_value=raw),patch.object(m,'DATA_PATH',Path(t)/'data.json'),patch.object(m,'FALLBACK_PATH',Path(t)/'fallback.js'):
   self.assertEqual(m.main(),0);d=json.loads((Path(t)/'data.json').read_text(encoding='utf-8'));self.assertEqual(d['priceUnit'],'USDT');self.assertEqual(d['series'][0]['usd'],.1);self.assertTrue(d['series'][0]['partial']);self.assertIsNone(d['observedAt']);self.assertIsNone(d['latestClosedPeriod']);self.assertEqual(d['sources']['bitcoin']['unit'],'USDT')
if __name__=='__main__':unittest.main()
