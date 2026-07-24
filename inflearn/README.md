# 인프런 데일리 아카이브

인프런 비로그인 메인 페이지에 공개된 강의 목록을 매일 수집해 JSON과 Excel로
보관하고, 웹 대시보드에서 검색·필터링·다운로드할 수 있게 합니다.

## 자동 수집

- 실행: 매일 09:15 KST (`.github/workflows/update-inflearn-daily.yml`)
- 수집기: `fetch_inflearn.py`
- 최신 데이터: `data/latest.json`
- 날짜별 원본: `data/history/YYYY-MM-DD.json`
- 날짜별 엑셀: `output/inflearn_main_YYYY-MM-DD.xlsx`

로컬 실행:

```powershell
python -m pip install openpyxl==3.1.5
python inflearn/fetch_inflearn.py
```

인프런 페이지 구조가 바뀌어 필수 데이터가 5개 미만으로 수집되면 작업을
실패 처리해 정상 파일이 잘못된 데이터로 덮어써지지 않도록 했습니다.
