"""Regression checks for source selection, raw-dollar sums and audited snapshots."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


trade = module('trade_collector', 'trade/fetch_data.py')
tourism = module('tourism_importer', 'korea-tourism/import_kto_workbook.py')


def item(code, exp, imp, balance=None):
    return f'<item><statCd>{code}</statCd><statCdCntnKor1>{code}</statCdCntnKor1><expDlr>{exp}</expDlr><impDlr>{imp}</impDlr><balPayments>{exp-imp if balance is None else balance}</balPayments></item>'


def xml(rows, count=None):
    return f'<response><resultCode>00</resultCode><totalCount>{len(rows) if count is None else count}</totalCount><items>{"".join(rows)}</items></response>'


class Sources(unittest.TestCase):
    def test_sum_raw_dollars_before_rounding_and_top40(self):
        total, countries = trade.parse_month(xml([item(f'C{i}', 600000, 0) for i in range(41)]))
        self.assertEqual(total, {'exp': 25, 'imp': 0, 'bal': 25})
        self.assertEqual(len(countries), 40)
        self.assertEqual(sum(row['exp'] for row in countries), 40)

    def test_explicit_zero_and_declared_total(self):
        total, countries = trade.parse_month(xml([item('총계', 10000000, 10000000, 0), item('CN', 1000000, 1000000, 0)]))
        self.assertEqual(total['bal'], 0)
        self.assertEqual(total['exp'], 10)
        self.assertEqual(countries[0]['bal'], 0)

    def test_bad_rows_are_rejected(self):
        for rows, count in [([item('CN', 100, 10, 0)], None), ([item('CN', -10, 0)], None), ([item('CN', 100, 10)] * 2, None), ([item('CN', 100, 10)], 501)]:
            with self.subTest(rows=rows, count=count), self.assertRaises(ValueError):
                trade.parse_month(xml(rows, count))

    def test_latest_monthly_release_excludes_calendar(self):
        html = '<a href="/site/portal/ex/bbs/View.do?bcIdx=1">2026년 7월 한국관광통계 공표</a><a href="/site/portal/ex/bbs/View.do?bcIdx=2">2026년 8월 한국관광통계 공표</a><a href="/site/portal/ex/bbs/View.do?bcIdx=3">2026년 10월 공표 일정</a>'
        self.assertEqual(tourism.latest_announcement(html), ('2026-08', '/site/portal/ex/bbs/View.do?bcIdx=2'))

    def test_only_full_country_workbook_is_selected(self):
        html = '<a onclick="funDownload(\'1\', \'2\', \'aaa.xlsx\')">월보_202608.xlsx</a><a onclick="funDownload(\'1\', \'2\', \'bbb.xlsx\')">전체국가통계_202608.xlsx</a>'
        self.assertTrue(tourism.announcement_workbook(html).endswith('streFileNm=bbb.xlsx'))

    def test_published_values_and_audit_scope(self):
        t = json.loads((ROOT / 'trade/data.json').read_text(encoding='utf-8'))
        latest = t['series'][-1]
        self.assertEqual([latest[k] for k in ('ym', 'exp', 'imp', 'bal')], ['2026-09', 121050, 71078, 49972])
        self.assertEqual(t['countryLatestYm'], t['latestYm'])
        tour = json.loads((ROOT / 'korea-tourism/data.json').read_text(encoding='utf-8'))
        self.assertEqual(tour['series'][-1], {'ym':'2026-09', 'china':656944, 'taiwan':208113, 'vietnam':51291})
        self.assertEqual(tour['sourcePublishedAt'], '2026-10-28')
        self.assertEqual(tour['nextPublication']['scheduledAt'], '2026-11-25')


if __name__ == '__main__':
    unittest.main()
