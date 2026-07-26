# 월간 거시경제 대시보드 · exchange-rate

공식 환율·거시경제 데이터를 집계·분석하는 자동 갱신 대시보드입니다.

1. **환율** — 유럽중앙은행(ECB) **일일 기준환율**을 영업일 단위로 수집해
   원화 교차환율과 **월평균 · 월최저 · 월최고**를 계산.
   미국 달러(USD) · 일본 엔(JPY, 100엔 기준) · 유로(EUR) · 중국 위안(CNY).
   커버리지는 **1999년~현재**이며 기간 프리셋·연도 구간으로 잘라 볼 수 있습니다.
2. **금리 · 물가** — 한국은행 **ECOS 경제통계 API**에서 **기준금리**와 **소비자물가지수(CPI)** 를
   월별 수집하고, 물가상승률(전년동월비, YoY)과 실질 기준금리를 함께 표시.
   기준금리 이력 기준 **1999-05~현재**이며 선택 기간 CSV 다운로드를 지원합니다.
3. **한·미 금리차** — OECD/FRED의 한국 콜머니·은행간 익일물 금리와 연준/FRED의
   실효 연방기금금리를 월별로 수집해 지난 30년의 **한국−미국 금리차(%p)** 를 표시.
4. **DRAM · 유가** — Stanford DAM 공개 CSV의 **DRAM 최저 소비자 소매가격(USD/GB)** 과
   FRED/EIA의 **브렌트유 일일 현물가격(USD/배럴)** 을 연간 평균으로 집계.
5. **금 · 구리 · 천연가스** — 세계은행 **Pink Sheet** 월별 가격을 연평균하고
   2018년=100 비교지수와 최신 실제 단가를 표시.
6. **비트코인** — Binance Vision **BTCUSDT 월봉**으로 월평균·고가·저가를 집계.
7. **오늘 데이터 새로고침** — 캐시를 우회해 환율·금리·물가·비트코인·시장 JSON을 다시 읽고
   각 데이터의 실제 최신 관측일을 화면에 표시.

- 대시보드: [`/exchange-rate/`](https://www.stargateedu.co.kr/exchange-rate/)
- 데이터: [`data.json`](./data.json)(환율) · [`bok_data.json`](./bok_data.json)(금리·물가) · [`bitcoin_data.json`](./bitcoin_data.json)(비트코인) · [`market_data.json`](./market_data.json)(DRAM·유가·원자재) · [`rate_gap.json`](./rate_gap.json)(한·미 금리차)

## 구성

| 파일 | 설명 |
|------|------|
| `index.html` | Chart.js 대시보드 (환율·금리·물가·한미 금리차 월간 차트, DRAM·유가·원자재 연간 차트, 표, CSV) |
| `fetch_data.py` | ECB 환율 수집 → 원화 교차환율·월간 집계 → `data.json`/`fallback-data.js` |
| `fetch_bok.py` | 한국은행 ECOS 기준금리·CPI 수집 → `bok_data.json`/`bok-fallback.js` |
| `fetch_markets.py` | Stanford DAM DRAM·FRED/EIA 브렌트유·세계은행 원자재 수집 → 연평균 집계 |
| `fetch_rate_gap.py` | FRED 한·미 익일물 금리 수집 → `rate_gap.json`/`rate-gap-fallback.js` |
| `fetch_bitcoin.py` | Binance Vision BTCUSDT 월봉 수집 → `bitcoin_data.json`/`bitcoin-fallback.js` |
| `data.json` | 월별 통화별 `{avg, min, max}` 매매기준율 |
| `bok_data.json` | 월별 `{baseRate, cpi, cpiYoY}` 금리·물가 |
| `bitcoin_data.json` | 월별 `{usd, usdMin, usdMax}` 비트코인 시세 |
| `market_data.json` | 연도별 DRAM·유가·금·구리·천연가스 가격 |
| `rate_gap.json` | 월별 `{koreaRate, usRate, gap}` 한·미 익일물 금리와 차이 |
| `fallback-data.js` · `bok-fallback.js` · `bitcoin-fallback.js` · `market-fallback.js` · `rate-gap-fallback.js` | JSON 로드 실패 시 내장 폴백 |
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

환율·DRAM·유가·금·구리·천연가스는 인증키 없이 자동 갱신됩니다. 금리·물가 정밀 갱신에만 아래 시크릿을 사용합니다.

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
python3 exchange-rate/fetch_rate_gap.py
python3 exchange-rate/fetch_bitcoin.py
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

**DRAM·유가·원자재 (`fetch_markets.py`)**
- DRAM은 Stanford DAM의 McCallum 역사 계열과 Keepa 월별 계열을 연결해 연평균을 계산합니다.
- 이 값은 최저 소비자 소매가격이므로 DRAM 현물·계약가격과 정의가 다릅니다.
- 브렌트유는 FRED `DCOILBRENTEU` 일일 현물가격(원출처 U.S. EIA)의 연평균입니다.
- 당해연도는 최근 관측일까지의 YTD 평균으로 표시합니다.
- 금·구리·미국 천연가스는 세계은행 Pink Sheet 월별 명목가격의 연평균입니다.

**한·미 금리차 (`fetch_rate_gap.py`)**
- 한국 `IRSTCI01KRM156N`과 미국 `FEDFUNDS`를 FRED 그래프 CSV에서 키 없이 월별 수집합니다.
- 현재 월에서 30년 전부터 두 시계열의 공통 월을 결합하고 `gap = koreaRate - usRate`(%p)를 계산합니다.
- 한국의 공식 기준금리는 1999년부터 공표됐기 때문에 30년 비교에는 양국에서 의미가 유사한 익일물 단기금리를 사용합니다.

## 출처

- [유럽중앙은행 환율 통계](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/) — 일일 기준환율
- [Frankfurter API](https://frankfurter.dev/) — ECB 환율 JSON 제공
- [한국은행 ECOS 경제통계시스템 API](https://ecos.bok.or.kr/) — 기준금리 `722Y001`, 소비자물가지수 `901Y009`
- [Stanford DAM Memory Prices](https://dam.stanford.edu/memory-prices.html) — DRAM 최저 소비자 소매가격 CSV
- [FRED DCOILBRENTEU](https://fred.stlouisfed.org/series/DCOILBRENTEU) — 브렌트유 현물가격(원출처 U.S. EIA)
- [World Bank Commodity Markets](https://www.worldbank.org/en/research/commodity-markets) — 금·구리·미국 천연가스 Pink Sheet
- [OECD/FRED 한국 콜머니·은행간 익일물 금리](https://fred.stlouisfed.org/series/IRSTCI01KRM156N) — 월평균, `IRSTCI01KRM156N`
- [Federal Reserve/FRED 실효 연방기금금리](https://fred.stlouisfed.org/series/FEDFUNDS) — H.15 월평균, `FEDFUNDS`
