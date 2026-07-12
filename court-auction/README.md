# 법원경매 주택 데이터 수집기 + 대시보드 (2026)

대한민국법원 [법원경매정보](https://www.courtauction.go.kr)의 주거용 건물
(아파트·단독·다가구·다세대·연립·오피스텔·주상복합) 경매 물건을
**공고일 기준**으로 2026년 월별 수집해:

1. **엑셀** — `output/법원경매_주택_2026.xlsx` (전체 / 월별요약 / 월별 시트)
2. **대시보드** — `index.html` + `data.json` (정적 페이지, GitHub Pages에서 바로 열람)

로 저장하는 프로그램입니다.

## 사용법

```bash
pip install requests openpyxl

# 2026년 1월 ~ 현재 월 전체 수집 (공고일 기준)
python3 fetch_court_auction.py

# 데이터가 있는 가장 최근 월만 수집
python3 fetch_court_auction.py --latest

# 특정 월만 수집
python3 fetch_court_auction.py --month 2026-06

# 네트워크 없이 샘플 데이터로 전체 파이프라인 실행
python3 fetch_court_auction.py --sample
```

실행하면 `output/법원경매_주택_2026.xlsx`와 `data.json`이 갱신되고,
대시보드(`index.html`)는 `data.json`을 읽어 자동으로 최신 내용을 표시합니다.

로컬에서 대시보드를 열 때는 간단한 서버를 띄워 주세요
(브라우저의 `file://` 보안 제한 때문에 fetch가 차단됩니다):

```bash
python3 -m http.server 8000
# → http://localhost:8000/court-auction/
```

## 대시보드 기능

- **KPI**: 물건 수(전월 대비 증감), 평균 감정가, 평균 최저매각가, 평균 유찰횟수
- **필터**: 공고월 / 시도 / 용도 — 모든 차트·표가 동일한 조건으로 갱신
- **차트**: 월별 공고 추이(막대 클릭으로 월 선택), 용도별·시도별 분포, 감정가 구간 분포
- **표**: 전체 물건 목록(열 정렬, 페이지네이션)
- 라이트/다크 모드 자동 지원, 외부 라이브러리 없음(순수 SVG)

## 주의사항

- **해외 IP 차단**: 법원경매정보 사이트는 해외 IP를 차단하므로 실데이터 수집은
  국내 네트워크에서 실행해야 합니다. 현재 커밋된 `data.json`/엑셀은
  `--sample`로 생성한 **샘플 데이터**이며, 대시보드에 "샘플 데이터" 배지가 표시됩니다.
- **API 변경 가능성**: 비공식 내부 API를 사용하므로 사이트 개편 시 요청/응답
  필드명이 바뀔 수 있습니다. 이 경우 브라우저 개발자도구(F12) → Network 탭에서
  "물건상세검색" 요청을 확인해 `fetch_court_auction.py` 상단의
  `API_URL` / `build_payload()` / `FIELD_CANDIDATES` 를 갱신하면 됩니다.
- **호출 예절**: 요청 간 1초 지연을 두며, 필요 이상으로 호출하지 않습니다.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `fetch_court_auction.py` | 수집기 (API 호출 → 정규화 → 엑셀/JSON 저장) |
| `data.json` | 대시보드용 데이터 (수집기 실행 시 갱신) |
| `index.html` | 정적 대시보드 |
| `output/법원경매_주택_2026.xlsx` | 엑셀 결과물 |
