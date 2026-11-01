import unittest,importlib.util,pathlib
module=pathlib.Path(__file__).resolve().parents[1]/'scripts/범죄 통계 갱신.py'
spec=importlib.util.spec_from_file_location('crime_refresh',module);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class SourceGuards(unittest.TestCase):
    def fixture(self):
        return [['총계','총계',10,12,120.0,14,1],['절도범죄','절도범죄',10,12,120.0,14,1]]
    def test_over_100_is_a_ratio_not_a_probability(self):m.validate_rows(self.fixture())
    def test_wrong_published_ratio_rejected(self):
        rows=self.fixture();rows[1][4]=100
        with self.assertRaisesRegex(ValueError,'비율'):m.validate_rows(rows)
    def test_subtotal_double_count_or_missing_major_rejected(self):
        rows=self.fixture();rows[1][5]=13
        with self.assertRaisesRegex(ValueError,'총합'):m.validate_rows(rows)
    def test_duplicate_offense_rejected(self):
        rows=self.fixture();rows.append(rows[1][:])
        with self.assertRaisesRegex(ValueError,'중복'):m.validate_rows(rows)
    def test_pdf_period_must_match_receipt(self):
        with self.assertRaisesRegex(ValueError,'분기 제목'):m.parse_rows('2026년 2분기 범죄 발생 및 검거 현황',self.fixture(),'2026Q3')
    def test_shifted_or_missing_source_rows_rejected(self):
        text='2026년 3분기 범죄 발생 및 검거 현황\n총계 10 12 120.0 14 1'
        with self.assertRaisesRegex(ValueError,'행 수'):m.parse_rows(text,self.fixture(),'2026Q3')
    def test_csv_is_excel_bom_and_preserves_ratio(self):
        b=m.csv_bytes([m.HEADERS,*self.fixture()]);self.assertTrue(b.startswith(b'\xef\xbb\xbf'));self.assertIn(b'120.0',b)
    def test_unspecified_pdf_timezone_is_not_invented(self):
        self.assertIn('시간대 미표기',m.document_timestamp('D:20260105162816'))
        self.assertEqual(m.document_timestamp("D:20261002150810+09'00'"),'2026-10-02 15:08:10 +09:00')

if __name__=='__main__':unittest.main()
