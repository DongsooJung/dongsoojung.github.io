import copy
import importlib.util
import unittest
import tempfile
import json
from unittest.mock import patch
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('history',ROOT/'scripts/build_google_trends_history.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

def sample():
    return {'sourceMode':'api','updatedAt':'2026-10-20T23:50:00+00:00','geo':['KR'],'hours':48,'limit':100,'errors':[],
            'items':[{'title':'company','category':'비즈니스 및 금융','categories':[3],'volume':100},
                     {'title':'sport','category':'스포츠','categories':[17],'volume':200},
                     {'title':'other','category':'미분류','categories':[],'volume':10}]}

class HistorySourceTests(unittest.TestCase):
    def test_label_change_does_not_change_primary_category_membership(self):
        p=sample();new=h.point(p);p['items'][0]['category']='비즈니스·산업';old=h.point(p)
        self.assertEqual(new['treatedRaw'],100)
        for field in ['date','treatedRaw','controlRaw','treatedCount','controlCount']:self.assertEqual(new[field],old[field])
    def test_uses_collector_timestamp_kst_day_and_preserves_git_timestamp(self):
        row=h.point(sample(),source_commit='abc',committed_at='2026-10-23T03:00:00+00:00')
        self.assertEqual(row['date'],'2026-10-21');self.assertEqual(row['collectorCompletedAt'],'2026-10-20T23:50:00+00:00');self.assertEqual(row['committedAt'],'2026-10-23T03:00:00+00:00')
    def test_missing_timezone_or_stamp_is_not_today_or_commit_date(self):
        for stamp in [None,'','2026-10-20T23:50:00']:
            p=sample();p['updatedAt']=stamp
            with self.assertRaises(ValueError):h.point(p)
    def test_missing_category_ids_cannot_silently_become_zero(self):
        p=sample();del p['items'][0]['categories']
        with self.assertRaises(ValueError):h.point(p)
    def test_true_zero_in_valid_selected_list_is_distinct_from_missing_ids(self):
        p=sample();p['items']=p['items'][1:]
        self.assertEqual(h.point(p)['treatedRaw'],0)
    def test_string_category_id_is_rejected_instead_of_zero(self):
        p=sample();p['items'][0]['categories']=['3']
        with self.assertRaises(ValueError):h.point(p)
    def test_other_geo_updates_do_not_change_did_history(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);data=root/'data.json';history=root/'history.json'
            p=sample();p['geo']=['US'];data.write_text(json.dumps(p),encoding='utf-8')
            original=json.dumps({'rows':[h.point(sample())]});history.write_text(original,encoding='utf-8')
            with patch.object(h,'DATA',data),patch.object(h,'HISTORY',history),patch('sys.argv',['history']):h.main()
            self.assertEqual(history.read_text(encoding='utf-8'),original)
    def test_regular_update_generates_matching_csv_with_bom(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);data=root/'data.json';history=root/'history.json'
            p=sample();data.write_text(json.dumps(p),encoding='utf-8')
            previous=[]
            for day in range(1,9):
                old=sample();old['updatedAt']=f'2026-10-{day:02}T01:00:00+00:00';previous.append(h.point(old))
            history.write_text(json.dumps({'rows':previous}),encoding='utf-8')
            with patch.object(h,'ROOT',root),patch.object(h,'DATA',data),patch.object(h,'HISTORY',history),patch('sys.argv',['history']):h.main()
            rows=json.loads(history.read_text(encoding='utf-8'))['rows']
            raw=(root/'did/data/검색 범주 시계열.csv').read_bytes()
            self.assertTrue(raw.startswith(b'\xef\xbb\xbf'));self.assertEqual(len(raw.decode('utf-8-sig').strip().splitlines()),len(rows)+1)
            self.assertEqual(len(rows),9);self.assertEqual(rows[-1]['treatedRaw'],100)
    def test_scope_errors_duplicates_and_invalid_volumes_are_rejected(self):
        invalid=[]
        for field,value in [('geo',['US']),('hours',24),('limit',50),('errors',[{'geo':'KR'}]),('sourceMode','fallback')]:
            p=sample();p[field]=value;invalid.append(p)
        p=sample();p['items'].append(copy.deepcopy(p['items'][0]));invalid.append(p)
        for value in [-1,None,1.5,True]:
            p=sample();p['items'][0]['volume']=value;invalid.append(p)
        for p in invalid:
            with self.assertRaises(ValueError):h.point(p)
    def test_primary_category_is_not_overlapping_membership(self):
        p=sample();p['items'][0]['categories']=[17,3]
        row=h.point(p);self.assertEqual(row['treatedRaw'],0);self.assertEqual(row['controlRaw'],300)
    def test_normalization_is_separate_per_category_and_does_not_fill_dates(self):
        rows=[{'date':'2026-10-01','treatedRaw':10,'controlRaw':30},{'date':'2026-10-03','treatedRaw':20,'controlRaw':10}]
        out=h.normalize(rows);self.assertEqual(len(out),2);self.assertEqual(out[0]['treated'],50);self.assertEqual(out[1]['control'],33.33)

if __name__=='__main__':unittest.main()
