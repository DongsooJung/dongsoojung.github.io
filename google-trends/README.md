# Google Trends 상위 100 분석 대시보드

Google Trends 급상승(Trending Now) 검색어를 수집해 **상위 100개**를
검색량·카테고리·연관어로 인터랙티브 시각화합니다.

- 페이지: https://www.stargateedu.co.kr/google-trends/
- 전략 허브: https://www.stargateedu.co.kr/strategy/ (상호 링크)
- 라이브 API: `/api/google-trends?geo=KR&hours=48&limit=100`
- 원본: [trends.google.com/trending](https://trends.google.com/trending?geo=KR)

Google은 공식 공개 Trends API를 제공하지 않습니다. 본 프로젝트는
Trending 페이지에 임베드된 `AF_initDataCallback(ds:0)` 페이로드를 파싱합니다.
검색량은 Google이 표기하는 근사 트래픽(approx)입니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 (Chart.js) — KPI · TOP20 막대 · 카테고리 도넛 · 순위 곡선 · 표/CSV |
| `fetch_data.py` | 수집 스크립트 — 지역·시간 창 기준으로 `data.json` 갱신 |
| `data.json` | 캐시된 상위 100건 |
| `fallback-data.js` | `data.json` JS 폴백 (`file://`·fetch 실패 대비) |
| `../api/google-trends.js` | Vercel 서버리스 프록시 (CORS·라이브 새로고침) |
| `../.github/workflows/update-google-trends.yml` | 매일 자동 갱신 |

## 로컬 수집

```bash
# 대한민국 · 48시간 · 상위 100 (기본)
python3 google-trends/fetch_data.py

# 시간 창·지역 변경
GEO=KR HOURS=24 LIMIT=100 python3 google-trends/fetch_data.py
GEO=KR,US,JP HOURS=48 LIMIT=100 python3 google-trends/fetch_data.py

# 다른 경로에만 저장 (KR 대시보드 data.json을 덮지 않음)
OUTPUT_PATH=/tmp/trends.json SKIP_FALLBACK=1 GEO=US HOURS=48 python3 google-trends/fetch_data.py
```

`HOURS` 권장값: `4` · `24` · `48` · `168`(7일)

## 대시보드 기능

- 지역·시간 창 선택 후 **라이브 새로고침** (`/api/google-trends`)
- 카테고리·검색어 필터, 열 정렬, CSV 내보내기
- 행/막대 클릭 시 연관 검색어 칩 표시
- API 실패 시 `data.json` → `fallback-data.js` 순 폴백

## 자동 갱신

GitHub Actions `Update Google Trends data` 워크플로가 매일 UTC 01:00에
KR 48시간 창 상위 100건을 갱신합니다. Actions 탭에서 수동 실행도 가능합니다.
