from pathlib import Path
import importlib.util,unittest
file=Path(__file__).resolve().parents[1]/'scripts/build-seoul-property.py'
spec=importlib.util.spec_from_file_location('seoul',file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SourceScope(unittest.TestCase):
 def row(self,year,date='20260901',price='10000',area='33.05785',cancel=''):
  return {'접수연도':str(year),'자치구명':'가구','계약일':date,'취소일':cancel,'건물용도':'아파트','물건금액(만원)':price,'건물면적(㎡)':area}
 def sources(self,more2025=None,more2026=None):
  return [(2025,[self.row(2025,'20250901'),*(more2025 or [])]),(2026,[self.row(2026),*(more2026 or [])])]
 def test_cancelled_rows_and_contract_years_are_separate_from_receipts(self):
  data=self.sources([self.row(2025,'20240401')],[self.row(2026,'20250915'),self.row(2026,cancel='20261001')])
  months,series,totals,prices,stats=m.aggregate(data,'2026-10-16',['가구'])
  self.assertEqual(stats['cancelledRows'],1);self.assertEqual(stats['outsideContractYears'],1);self.assertEqual(stats['includedRows'],3)
  self.assertEqual(totals[months.index('2025-09')],2);self.assertEqual(prices['가구']['previousN'],2)
 def test_equal_value_transactions_are_preserved_and_reported(self):
  _,_,totals,prices,stats=m.aggregate(self.sources(more2026=[self.row(2026)]),'2026-10-16',['가구'])
  self.assertEqual(stats['identicalValueExtraRowsRetained'],1);self.assertEqual(sum(totals),3);self.assertEqual(prices['가구']['n'],2);self.assertAlmostEqual(prices['가구']['price'],1000)
 def test_yoy_uses_matching_month_and_day_but_monthly_history_keeps_later_previous_months(self):
  months,_,totals,prices,_=m.aggregate(self.sources(more2025=[self.row(2025,'20251017',price='9999999')]),'2026-10-16',['가구'])
  self.assertEqual(prices['가구']['previousN'],1);self.assertEqual(prices['가구']['yoy'],0);self.assertEqual(totals[months.index('2025-10')],1)
 def test_schema_filter_mismatch_and_future_dates_fail_closed(self):
  for sources in [self.sources(more2026=[self.row(2025)]),self.sources(more2026=[self.row(2026,'20261019')]),[(2025,[{}])]]:
   with self.assertRaises(ValueError):m.aggregate(sources,'2026-10-16',['가구'])
if __name__=='__main__':unittest.main()
