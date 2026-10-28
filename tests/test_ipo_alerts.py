"""Deterministic offline tests for IPO change detection."""
from __future__ import annotations
import runpy
import unittest
from pathlib import Path
M = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/build-ipo-alerts.py"),run_name="test_alerts")
NOW = "2026-10-29T09:00:00+09:00"

def filing(rcp="20261028000434", start="2026-12-14"):
    return {"rcept_no":rcp,"name":"테스트기업","source":"OpenDART estkRs",
            "subscription_start":start,"subscription_end":start,
            "payment_date":"2026-12-17","offering_price_raw":"8,000"}

def calendar(items):
    return {"status":"ok","records":items,"updated_at":NOW,
            "coverage":{"truncated":True,"pages_checked":8,"total_pages":33}}

class AlertTests(unittest.TestCase):
    def test_initial_run_silent_baseline_and_stable_repeat(self):
        baseline=M["collect"]({"status":"not_initialized"},calendar([filing()]),{},NOW)
        self.assertEqual(baseline["last_scan_new_count"],0)
        self.assertEqual(baseline["events"],[])
        self.assertEqual(baseline["baseline_created"],True)
        second=M["collect"](baseline,calendar([filing()]),{},"2026-10-30T09:00:00+09:00")
        self.assertEqual(second["last_scan_new_count"],0)
    def test_new_receipt_exactly_once(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        later=M["collect"](old,calendar([filing(),filing("20261029000999")]),{},
                           "2026-10-30T09:00:00+09:00")
        self.assertEqual(later["last_scan_new_count"],1)
        self.assertEqual(later["events"][0]["type"],"new_filing")
        self.assertEqual(later["events"][0]["source_url"],
                         "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261029000999")
        repeat=M["collect"](later,calendar([filing(),filing("20261029000999")]),{},
                            "2026-10-31T09:00:00+09:00")
        self.assertEqual(repeat["last_scan_new_count"],0)
        self.assertEqual(len(repeat["events"]),1)
    def test_changed_schedule_alert_once(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        later=M["collect"](old,calendar([filing(start="2026-12-15")]),{},
                           "2026-10-30T09:00:00+09:00")
        self.assertEqual(later["events"][0]["type"],"schedule_changed")
        self.assertEqual(later["last_scan_new_count"],1)
        repeat=M["collect"](later,calendar([filing(start="2026-12-15")]),{},
                            "2026-10-31T09:00:00+09:00")
        self.assertEqual(repeat["last_scan_new_count"],0)
    def test_omitted_receipt_does_not_reappear_as_new(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        skipped=M["collect"](old,calendar([]),{},"2026-10-30T09:00:00+09:00")
        reappeared=M["collect"](skipped,calendar([filing()]),{},
                               "2026-10-31T09:00:00+09:00")
        self.assertEqual(reappeared["last_scan_new_count"],0)
    def test_kind_initially_silent_subsequently_new_review(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        review={"name":"테스트기업","stage":"review_applied",
                "announcement_date":"2026-10-29",
                "source_url":"https://kind.krx.co.kr/test"}
        data={"status":"ok","records":[review]}
        accepted=M["collect"](old,calendar([filing()]),data,
                              "2026-10-30T09:00:00+09:00")
        self.assertEqual(accepted["last_scan_new_count"],0)
        additional={**review,"stage":"review_approved","announcement_date":"2026-10-31"}
        next_run=M["collect"](accepted,calendar([filing()]),
                             {"status":"ok","records":[review,additional]},
                             "2026-11-01T09:00:00+09:00")
        self.assertEqual(next_run["last_scan_new_count"],1)
        self.assertEqual(next_run["events"][0]["type"],"review_event")
    def test_bad_source_never_triggers_alert_and_bad_snapshot_fails_closed(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        forged={**filing("20261029000999"),"source":"manual"}
        later=M["collect"](old,calendar([filing(),forged]),{},
                           "2026-10-30T09:00:00+09:00")
        self.assertEqual(later["last_scan_new_count"],0)
        with self.assertRaises(ValueError):
            M["collect"](old,{"status":"not_connected","records":[]},{},NOW)
    def test_invalid_receipt_is_ignored(self):
        old=M["collect"]({},calendar([filing()]),{},NOW)
        bad=filing("NOT_VALID")
        later=M["collect"](old,calendar([bad]),{},
                           "2026-10-30T09:00:00+09:00")
        self.assertEqual(later["last_scan_new_count"],0)
        self.assertEqual(len(later["seen"]),1)

if __name__ == "__main__":
    unittest.main()
