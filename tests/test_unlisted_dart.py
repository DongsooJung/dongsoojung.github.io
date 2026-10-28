"""Offline tests for the STARGATE OpenDART snapshot collector."""
from __future__ import annotations

import runpy
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

M = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts" / "update-unlisted-dart.py"), run_name="collector_tests")


class OpenDartCollectorTests(unittest.TestCase):
    def test_name_exact_and_legal_prefix(self):
        self.assertEqual(M["normalize_name"]("주식회사 삼성메디슨"), "삼성메디슨".lower())
        self.assertNotEqual(M["normalize_name"]("삼성메디슨"), M["normalize_name"]("삼성메디슨홀딩스"))

    def test_amount_and_blank(self):
        parse = M["parse_amount"]
        self.assertEqual(parse("1,234,567"), 1234567)
        self.assertEqual(parse("(12,000)"), -12000)
        self.assertIsNone(parse("-"))
        self.assertIsNone(parse("not a number"))

    def test_income_statement_only_and_no_silent_sum(self):
        rows = [
            {"sj_div": "IS", "account_nm": "매출액", "thstrm_amount": "90", "thstrm_add_amount": "180"},
            {"sj_div": "BS", "account_nm": "자산총계", "thstrm_amount": "400"},
            {"sj_div": "BS", "account_nm": "매출액", "thstrm_amount": "999"},
        ]
        fy = M["parse_metrics"](rows)
        h1 = M["parse_metrics"](rows, cumulative=True)
        self.assertEqual(fy["revenue"], 90)
        self.assertEqual(h1["revenue"], 180)
        self.assertEqual(h1["assets"], 400)
        self.assertIsNone(fy["operating_profit"])

    def test_conflicting_equal_priority_values_are_not_guessed(self):
        rows = [
            {"sj_div": "IS", "account_nm": "매출액", "thstrm_amount": "100"},
            {"sj_div": "CIS", "account_nm": "매출액", "thstrm_amount": "200"},
        ]
        self.assertIsNone(M["parse_metrics"](rows)["revenue"])

    def test_report_dates_never_include_future_full_year(self):
        kst = timezone(timedelta(hours=9))
        now = datetime(2026, 10, 29, tzinfo=kst)
        periods = M["available_reports"](now)
        self.assertEqual(periods[0]["period"], "2026 H1")
        self.assertIn("2025 FY", [p["period"] for p in periods])
        self.assertNotIn("2026 FY", [p["period"] for p in periods])
        self.assertNotIn("2026 Q3", [p["period"] for p in periods])

    def test_corporate_ambiguity_returns_no_corp_code(self):
        data = {"테스트": [{"corp_code": "00000001"}, {"corp_code": "00000002"}]}
        result = M["financials_for_company"]("unused", "테스트", "123456", data, [])
        self.assertEqual(result["match"], "ambiguous")
        self.assertIsNone(result["corp_code"])


if __name__ == "__main__":
    unittest.main()
