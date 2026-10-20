import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trends',ROOT/'google-trends/fetch_data.py')
trends=importlib.util.module_from_spec(spec)
spec.loader.exec_module(trends)

class OfficialTaxonomy(unittest.TestCase):
    def test_observed_official_menu_ids_replace_legacy_wrong_categories(self):
        for category,label in [(20,'기후'),(16,'쇼핑'),(15,'과학')]:
            row=['오늘날씨',None,'KR',[1792534200],None,None,200000,None,None,[],[category]]
            result=trends.parse_row(row,'KR')
            self.assertEqual(result['category'],label)
            self.assertEqual(result['categories'],[category])

    def test_unknown_ids_remain_explicit_and_empty_categories_are_unclassified(self):
        self.assertEqual(trends.category_label([999]),'카테고리 999')
        self.assertEqual(trends.category_label([]),'미분류')

if __name__=='__main__':unittest.main()
