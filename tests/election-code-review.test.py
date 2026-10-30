from pathlib import Path
from tempfile import TemporaryDirectory
from io import BytesIO
from zipfile import ZipFile
import importlib.util,json,unittest,hashlib
from openpyxl import Workbook

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('codes',ROOT/'scripts/review-election-codes.py');codes=importlib.util.module_from_spec(spec);spec.loader.exec_module(codes)

def source_zip(rows,text_rows=None):
    w=Workbook();w.active.title='KIKcd_H';w.active.append(['행정동코드','시도명','시군구명','읍면동명','생성일자','말소일자'])
    for r in rows:w.active.append(r)
    stream=BytesIO();w.save(stream);output=BytesIO()
    txt=['행정동코드'.encode('cp949')]
    for row in text_rows or rows:
        txt.append(b' '.join(str(v or '').encode('cp949').ljust(n,b' ') for v,n in zip(row,[10,30,30,30,8,8])))
    with ZipFile(output,'w') as z:z.writestr('jscode20261026/KIKcd_H.20261026.xlsx',stream.getvalue());z.writestr('jscode20261026/KIKcd_H.20261026',b'\r\n'.join(txt))
    return output.getvalue()

class Codes(unittest.TestCase):
    def test_independent_text_disagreement_duplicate_and_abolished_codes_rejected(self):
        row=('4122067000','경기도','평택시','고덕1동','20261012','')
        self.assertEqual(codes.parse_registry(source_zip([row]),'20261026'),[row])
        for raw in [source_zip([row,row]),source_zip([row],text_rows=[(*row[:3],'다른동',*row[4:])]),source_zip([(*row[:-1],'20261026')]),source_zip([('41220670',*row[1:])])]:
            with self.assertRaises(ValueError):codes.parse_registry(raw,'20261026')

    def test_new_codes_and_changed_names_do_not_inherit_district_or_modify_geometry(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp);rows=[];before={}
            for city,(name,prefix) in codes.CITIES.items():
                code=prefix.ljust(10,'1');f=root/f'{city}-election/data/emd.geojson';f.parent.mkdir(parents=True)
                f.write_text(json.dumps({'features':[{'properties':{'emd_cd':code,'emd_nm':'이전동','district':'갑'}}]}));before[f]=f.read_bytes()
                rows.extend([(code,'경기도',name,'새이름','20200101',''),(prefix.ljust(10,'2'),'경기도',name,'신설동','20261012',''),(prefix.ljust(10,'0'),'경기도',name,'','20200101','')])
            output,review=codes.compare(rows,root)
            self.assertEqual(len(output),8)
            self.assertTrue(all(r['savedElectoralDistrict']=='' for r in output))
            self.assertTrue(all(r['geometryVerification']=='not_verified' for r in output))
            self.assertTrue(all(f.read_bytes()==v for f,v in before.items()))

    def test_published_reference_counts_missing_codes_and_unknown_geometry_are_explicit(self):
        ref=json.loads((ROOT/'data/election/administrative-code-review.json').read_text(encoding='utf8'))
        self.assertEqual(len(ref['rows']),149);self.assertEqual(sum(c['matchingCodeAndName'] for c in ref['cities'].values()),147)
        self.assertEqual(ref['source']['providerNoticeReferenceDate'],'2026-10-30');self.assertEqual(ref['source']['fileDateLabel'],'20261026')
        p=ref['cities']['pyeongtaek'];self.assertEqual({r['code'] for r in p['currentUnitsWithoutSavedGeometry']},{'4122067000','4122068000'});self.assertEqual(p['savedCodesAbsentFromActiveFile'][0]['code'],'4122066000')
        for city,c in ref['cities'].items():self.assertEqual(hashlib.sha256((ROOT/f'{city}-election/data/emd.geojson').read_bytes()).hexdigest(),c['geometrySha256']);self.assertIsNone(c['sourceBoundaryDate'])
        self.assertTrue(all(r['geometryVerification']=='not_verified' and r['electoralDistrictVerification']=='not_verified' for r in ref['rows']))

if __name__=='__main__':unittest.main()
