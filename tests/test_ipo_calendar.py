"""Offline tests for sourced IPO dates and KIND feed validation."""
from __future__ import annotations
import runpy
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
D = runpy.run_path(str(ROOT / "scripts" / "update-ipo-calendar.py"),run_name="ipo_test")
K = runpy.run_path(str(ROOT / "scripts" / "update-kind-ipo-feed.py"),run_name="kind_test")

class IpoDates(unittest.TestCase):
    def test_single_date(self):
        self.assertEqual(D["parse_day"]("2026.11.03"),"2026-11-03")
        self.assertEqual(D["parse_day"]("2026년 11월 3일"),"2026-11-03")
        self.assertEqual(D["parse_day"]("20261103"),"2026-11-03")
        self.assertIsNone(D["parse_day"]("미정"))
        self.assertIsNone(D["parse_day"]("2026.02.30"))
    def test_range_explicit_dates_only(self):
        self.assertEqual(D["parse_subscription_dates"]("2026.11.03 ~ 2026.11.04"),
                         ("2026-11-03","2026-11-04"))
        self.assertEqual(D["parse_subscription_dates"]("2026.11.03 ~ 2026.10.30"),(None,None))
        self.assertEqual(D["parse_subscription_dates"]("2026년 11월 초"),(None,None))
    def test_only_equity_filing_subject(self):
        self.assertTrue(D["EQUITY_RE"].search("정정증권신고서(지분증권)"))
        self.assertFalse(D["EQUITY_RE"].search("투자설명서(일괄신고)"))
        self.assertFalse(D["EQUITY_RE"].search("증권신고서(채무증권)"))
    def test_group_receipt_whitelist_and_issuer_match(self):
        rcp="20261028000434"
        payload={"status":"000","group":[
          {"title":"일반사항","list":[{"rcept_no":rcp,"corp_cls":"E",
               "corp_code":"00012345","corp_name":"테스트기업",
               "sbd":"2026.11.03 ~ 2026.11.04","pymd":"2026.11.06"}]},
          {"title":"증권의종류","list":[{"rcept_no":rcp,"slprc":"15,000"}]}
        ]}
        result=D["normalize_prospectus"](payload,{rcp},"00012345")
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["subscription_start"],"2026-11-03")
        self.assertEqual(result[0]["payment_date"],"2026-11-06")
        self.assertEqual(result[0]["ipo_status"],"unconfirmed")
        self.assertEqual(D["normalize_prospectus"](payload,{"20260101000000"},"00012345"),[])
        self.assertEqual(D["normalize_prospectus"](payload,{rcp},"00009999"),[])
    def test_unlisted_filter(self):
        self.assertEqual(D["normalize_prospectus"]({"status":"013"},set(),"00012345"),[])

class KindContract(unittest.TestCase):
    def test_accept_official_evidence_url_only(self):
        item={"name":"가상기업","stage":"review_applied","announcement_date":"2026-10-29",
              "source_url":"https://kind.krx.co.kr/listing/test","market":"KOSDAQ"}
        self.assertEqual(len(K["validate_payload"]({"records":[item]})),1)
        for url in ("https://example.com/ipo","http://kind.krx.co.kr/foo"):
            with self.assertRaises(K["FeedError"]):
                K["validate_payload"]({"records":[{**item,"source_url":url}]})
    def test_refuse_invented_review_stages_and_bad_dates(self):
        valid={"name":"가상기업","stage":"review_applied","announcement_date":"2026-10-29",
               "source_url":"https://kind.krx.co.kr/"}
        with self.assertRaises(K["FeedError"]):
            K["validate_payload"]({"records":[{**valid,"stage":"ipo_guaranteed"}]})
        with self.assertRaises(K["FeedError"]):
            K["validate_payload"]({"records":[{**valid,"announcement_date":"2026-02-30"}]})
    def test_feed_rejects_private_unlisted_hosts_without_network(self):
        with self.assertRaises(K["FeedError"]):
            K["check_remote_url"]("https://127.0.0.1/private","127.0.0.1")

if __name__ == "__main__":
    unittest.main()
