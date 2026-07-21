# 월간 거시경제 대시보드 · exchange-rate

공식 환율·거시경제 데이터를 집계·분석하는 자동 갱신 대시보드입니다.

1. **환율** — 유럽중앙은행(ECB) **일일 기준환율**을 영업일 단위로 수집해
   원화 교차환율과 **월평균 · 월최저 · 월최고**를 계산.
   미국 달러(USD) · 일본 엔(JPY, 100엔 기준) · 유로(EUR) · 중국 위안(CNY).
2. **금리 · 물가** — 한국은행 **ECOS 경제통계 API**에서 **기준금리**와 **소비자물가지수(CPI)** 를
   월별 수집하고, 물가상승률(전년동월비, YoY)과 실질 기준금리를 함께 표시.
3. **DRAM · 유가** — Stanford DAM 공개 CSV의 **DRAM 최저 소비자 소매가격(USD/GB)** 과
   FRED/EIA의 **브렌트유 일일 현물가격(USD/배럴)** 을 연간 평균으로 집계.

- 대시보드: [`/exchange-rate/`](https://www.stargateedu.co.kr/exchange-rate/)
- 데이터: [`data.json`](./data.json)(환율) · [`bok_data.json`](./bok_data.json)(금리·물가) · [`market_data.json`](./market_data.json)(DRAM·유가)

## 구성

| 파일 | 설명 |
|------|------|
| `index.html` | Chart.js 대시보드 (환율·금리·물가 월간 차트, DRAM·유가 연간 차트, 표, CSV) |
| `fetch_data.py` | ECB 환율 수집 → 원화 교차환율·월간 집계 → `data.json`/`fallback-data.js` |
| `fetch_bok.py` | 한국은행 ECOS 기준금리·CPI 수집 → `bok_data.json`/`bok-fallback.js` |
| `fetch_markets.py` | Stanford DAM DRAM·FRED/EIA 브렌트유 수집 → 연평균 집계 |
| `data.json` | 월별 통화별 `{avg, min, max}` 매매기준율 |
| `bok_data.json` | 월별 `{baseRate, cpi, cpiYoY}` 금리·물가 |
| `market_data.json` | 연도별 `{dramUsdPerGb, brentUsdPerBbl}` DRAM·유가 |
| `fallback-data.js` · `bok-fallback.js` · `market-fallback.js` | JSON 로드 실패 시 내장 폴백 |
| `chart.umd.min.js` | Chart.js (오프라인 번들) |

## 데이터 스키마

```jsonc
{
  "sourceMode": "ecb",
  "updatedAt": "2026-07-17",
  "observedAt": "2026-07-17",
  "currencies": [
    {"code":"USD","label":"미국 달러","per":1,"color":"#3987e5"}
  ],
  "series": [
    {
      "ym": "2024-01",
      "days": 22,                  // 집계에 쓰인 영업일 수
      "rates": {
        "USD": {"avg":1330.5,"min":1310.0,"max":1345.0}
      }
    }
  ],
  "latest": {
    "date": "2026-07-17",
    "rates": {"USD": 1485.63, "JPY": 914.89}
  }
}
```

- **엔(JPY)은 100엔당** 기준(`per: 100`)입니다.
- `latest`는 가장 최근 ECB 영업일 기준환율이고, `series`는 월간 집계입니다.

## 자동 갱신 설정

환율·DRAM·유가는 인증키 없이 자동 갱신됩니다. 금리·물가 정밀 갱신에만 아래 시크릿을 사용합니다.

| 시크릿 | 발급처 | 용도 |
|--------|--------|------|
| `BOK_API_KEY` | [한국은행 ECOS 인증키 신청](https://ecos.bok.or.kr/api/#/AuthKeyApply) | 기준금리·물가 |

이후 [`update-exchange-rate.yml`](../.github/workflows/update-exchange-rate.yml)이
**평일 매일 03:20 KST** 자동 실행되어 최신 ECB 영업일을 집계·커밋합니다.
즉시 실행하려면 Actions 탭에서 *Update exchange rate data → Run workflow*.
`bok_api_key` 입력란은 ECOS를 시크릿 없이 1회 시험할 때만 사용합니다.

로컬 실행:

```bash
python3 exchange-rate/fetch_data.py
BOK_API_KEY=<인증키>  python3 exchange-rate/fetch_bok.py
python3 exchange-rate/fetch_markets.py
```

## 집계 로직

**환율 (`fetch_data.py`)**
- 2024년 1월부터 현재까지 ECB 일일 기준환율을 한 번에 가져옵니다.
- EUR 기준 `USD·JPY·KRW·CNY` 값에서 통화 1단위당 원화 교차환율을 계산합니다.
- 각 월의 `avg/min/max`와 가장 최근 영업일의 `latest`를 생성합니다.
- 최신 관측치가 7일보다 오래되면 성공 처리하지 않아 오래된 데이터가 정상으로 표시되는 일을 막습니다.

**금리·물가 (`fetch_bok.py`)**
- 한국은행 기준금리(`722Y001`/`0101000`)와 소비자물가지수(`901Y009`/`0`)를 주기 `M`으로 조회합니다.
- 물가상승률(`cpiYoY`)은 CPI의 전년동월비이므로 12개월 이전(2023-01)부터 CPI를 받아 계산합니다.

**DRAM·유가 (`fetch_markets.py`)**
- DRAM은 Stanford DAM의 McCallum 역사 계열과 Keepa 월별 계열을 연결해 연평균을 계산합니다.
- 이 값은 최저 소비자 소매가격이므로 DRAM 현물·계약가격과 정의가 다릅니다.
- 브렌트유는 FRED `DCOILBRENTEU` 일일 현물가격(원출처 U.S. EIA)의 연평균입니다.
- 당해연도는 최근 관측일까지의 YTD 평균으로 표시합니다.

## 출처

- [유럽중앙은행 환율 통계](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/) — 일일 기준환율
- [Frankfurter API](https://frankfurter.dev/) — ECB 환율 JSON 제공
- [한국은행 ECOS 경제통계시스템 API](https://ecos.bok.or.kr/) — 기준금리 `722Y001`, 소비자물가지수 `901Y009`
- [Stanford DAM Memory Prices](https://dam.stanford.edu/memory-prices.html) — DRAM 최저 소비자 소매가격 CSV
- [FRED DCOILBRENTEU](https://fred.stlouisfed.org/series/DCOILBRENTEU) — 브렌트유 현물가격(원출처 U.S. EIA)
