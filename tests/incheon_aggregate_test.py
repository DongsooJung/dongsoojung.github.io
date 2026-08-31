import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("incheon", Path(__file__).resolve().parents[1] / "scripts/build-incheon-academy.py")
incheon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(incheon)


class AggregateTest(unittest.TestCase):
    def test_courses_deduplicate_but_types_and_branches_do_not(self):
        groups, totals, validation = incheon.aggregate([("학원", [
            {"A": "학원명", "B": "학원주소\t"},
            {"A": "예시학원", "B": "인천광역시 서구 검단로 1"},
            {"A": "예시 학원", "B": "인천광역시 검단구 검단로 1"},
            {"A": "예시학원", "B": "인천광역시 서해구 검단로 2"},
        ]), ("교습소", [
            {"A": "교습소명", "B": "교습소주소"},
            {"A": "예시학원", "B": "인천광역시 검단구 검단로 1"},
        ])])
        self.assertEqual(totals, {"academyCount": 2, "teachingRoomCount": 1, "total": 3})
        self.assertEqual(validation["duplicateCourseRows"], 1)
        self.assertEqual(next(g for g in groups if g["code"] == "ic-sg")["total"], 3)

    def test_unknown_region_fails(self):
        with self.assertRaisesRegex(ValueError, "Unmapped"):
            incheon.aggregate([("학원", [{"A": "학원명", "B": "학원주소"}, {"A": "예시", "B": "서울특별시 강남구 길 1"}])])

    def test_missing_identity_fails(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            incheon.aggregate([("학원", [{"A": "학원명", "B": "학원주소"}, {"A": "예시"}])])

    def test_michuhol_rename(self):
        groups, totals, _ = incheon.aggregate([("학원", [
            {"A": "학원명", "B": "학원주소"},
            {"A": "예시", "B": "인천광역시 남구 길 1"},
            {"A": "예시", "B": "인천광역시 미추홀구 길 1"},
        ])])
        self.assertEqual(totals["total"], 1)
        self.assertEqual(next(g for g in groups if g["code"] == "ic-mh")["total"], 1)


if __name__ == "__main__":
    unittest.main()
