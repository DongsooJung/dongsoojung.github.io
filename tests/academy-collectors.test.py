"""Regressions for course rows versus facilities and source-date semantics."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
def load(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/f'scripts/build-{name}-academy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
gg,seoul=load('gyeonggi'),load('seoul')
class Collectors(unittest.TestCase):
 def gg_rows(self):
  return [{'A':city,'B':'가나다','E':'경기도 '+city+' 첫째길 1'} for city in gg.CITIES]
 def test_course_duplicates_do_not_become_facilities_or_cross_types(self):
  header={'A':'지역','B':'학원명','E':'주소'};rows=self.gg_rows();duplicate={**rows[0],'B':'가 나 다'}
  teaching=[{'A':'지역','B':'교습소명','E':'교습소주소'},rows[0]]
  groups,total,validation=gg.aggregate([('academyCount',[('전체',[header,*rows,duplicate])]),('teachingRoomCount',[('전체',teaching)])])
  self.assertEqual(total,{'academyCount':31,'teachingRoomCount':1,'total':32});self.assertEqual(validation['duplicateCourseRows'],1)
  self.assertEqual(groups[0]['total'],2)
 def test_unknown_jurisdiction_does_not_silently_drop_facilities(self):
  rows=self.gg_rows();rows[0]={**rows[0],'E':'경기도 알수없음시 첫째길 1'}
  with self.assertRaisesRegex(ValueError,'Unmapped'):gg.aggregate([('academyCount',[('전체',[{'B':'학원명','E':'주소'},*rows])])])
 def test_only_reviewed_seongnam_prefix_is_repaired(self):
  rows=self.gg_rows();i=gg.CITIES.index('성남시');bad={**rows[i],'E':'5경기도 성남시 첫째길 1'}
  sources=[('academyCount',[('전체',[{'B':'학원명','E':'주소'},*rows]),('성남',[{'B':'학원명','E':'주소'},bad])])]
  _,t,v=gg.aggregate(sources);self.assertEqual(t['total'],31);self.assertEqual(v['correctedAddressPrefixRows'],1);self.assertEqual(v['duplicateCourseRows'],1)
 def seoul_rows(self):
  return [{'행정구역명':city,'학원지정번호':str(i),'학원/교습소':'학원','등록상태명':'개원','적재일시':'20261011','등록일자':'20200101','도로명주소':'서울특별시 '+city+' 첫째길 1'} for i,city in enumerate(seoul.CITIES)]
 def test_blank_district_uses_source_address_and_loading_date_is_not_an_observation(self):
  rows=self.seoul_rows();rows[0]['행정구역명']='';rows[0]['등록일자']='21060906'
  groups,t,v=seoul.aggregate(rows);self.assertEqual(t['total'],25);self.assertEqual(v['districtsRecoveredFromRoadAddress'],1);self.assertEqual(v['futureRegistrationDateRows'],1)
  self.assertEqual(v['rowLoadedAtRange'],['20261011','20261011']);self.assertNotIn('dataAsOf',v)
  self.assertEqual(groups[0]['name'],'종로구')
 def test_duplicate_registration_ids_and_unexpected_status_require_source_review(self):
  rows=self.seoul_rows()
  with self.assertRaisesRegex(ValueError,'Duplicate'):seoul.aggregate([*rows,rows[0]])
  rows[0]['등록상태명']='폐원'
  with self.assertRaisesRegex(ValueError,'status'):seoul.aggregate(rows)
if __name__=='__main__':unittest.main()
