import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('airbnb',ROOT/'scripts/update_airbnb_dashboard.py')
airbnb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(airbnb)


class ListingArea(unittest.TestCase):
    def source(self, meta='', body=''):
        return f'<html><head><title>부산광역시 영도구 동삼동 빌라 월세 500 / 51만원 | 당근부동산</title>{meta}</head><body>방 3개 {body}</body></html>'

    def test_unit_metadata_takes_priority_over_building_register(self):
        source=self.source('<meta name="description" content="전용면적 47.4㎡">','연면적 767.83㎡ 전용면적 46㎡')
        result=airbnb.parse_listing('https://realty.daangn.com/articles/4165847',source)
        self.assertEqual(result['area_m2'],47.4)
        self.assertEqual(result['area_basis'],'exclusive')

    def test_building_area_cannot_fill_missing_unit_area(self):
        result=airbnb.parse_listing('https://realty.daangn.com/articles/1',self.source(body='연면적 750.7㎡'))
        self.assertIsNone(result['area_m2'])
        self.assertIsNone(result['area_basis'])

    def test_explicit_body_unit_area_is_usable_without_metadata(self):
        result=airbnb.parse_listing('https://realty.daangn.com/articles/1',self.source(body='연면적 750.7㎡ 전용면적 59.2㎡'))
        self.assertEqual(result['area_m2'],59.2)


if __name__=='__main__':unittest.main()
