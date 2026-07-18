# 월간 거시경제 대시보드 · exchange-rate

두 개의 공공 API를 월간으로 집계·분석하는 대시보드입니다.

1. **환율** — 한국수출입은행 **환율정보 Open API**의 일일 매매기준율(`deal_bas_r`)을
   영업일 단위로 수집해 **월평균 · 월최저 · 월최고**로 집계.
   미국 달러(USD) · 일본 엔(JPY, 100엔 기준) · 유로(EUR) · 중국 위안(CNH).
2. **금리 · 물가** — 한국은행 **ECOS 경제통계 API**에서 **기준금리**와 **소비자물가지수(CPI)** 를
   월별 수집하고, 물가상승률(전년동월비, YoY)과 실질 기준금리를 함께 표시.

- 대시보드: [`/exchange-rate/`](https://www.stargateedu.co.kr/exchange-rate/)
- 데이터: [`data.json`](./data.json)(환율) · [`bok_data.json`](./bok_data.json)(금리·물가)

## 구성

| 파일 | 설명 |
|------|------|
| `index.html` | Chart.js 대시보드 (통화·기간 필터, 월평균 라인+변동밴드, 상대강도 지수, 전월비, 금리 vs 물가, 표, CSV) |
| `fetch_data.py` | 수출입은행 환율 API 수집 → 월간 집계 → `data.json`/`fallback-data.js` |
| `fetch_bok.py` | 한국은행 ECOS 기준금리·CPI 수집 → `bok_data.json`/`bok-fallback.js` |
| `data.json` | 월별 통화별 `{avg, min, max}` 매매기준율 |
| `bok_data.json` | 월별 `{baseRate, cpi, cpiYoY}` 금리·물가 |
| `fallback-data.js` · `bok-fallback.js` | JSON 로드 실패 시 내장 폴백 |
| `chart.umd.min.js` | Chart.js (오프라인 번들) |

## 데이터 스키마

```jsonc
{
  "sourceMode": "seed",            // 시드(근사) | api(정밀)
  "updatedAt": "2026-07-18",
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
  ]
}
```

- **엔(JPY)은 100엔당** 고시 기준(`per: 100`)입니다.
- 시드 데이터는 `approx: true` 플래그가 붙은 근사 월평균이며 API 정밀치로 대체됩니다.

## 자동 갱신 설정

저장소 **Settings → Secrets and variables → Actions**에 아래 시크릿을 등록합니다.

| 시크릿 | 발급처 | 용도 |
|--------|--------|------|
| `EXIM_API_KEY` | [수출입은행 오픈API](https://www.koreaexim.go.kr/ir/HPHKIR019M01) (현재환율) | 환율 |
| `BOK_API_KEY` | [한국은행 ECOS 인증키 신청](https://ecos.bok.or.kr/api/#/AuthKeyApply) | 기준금리·물가 |

이후 [`update-exchange-rate.yml`](../.github/workflows/update-exchange-rate.yml)이
**매월 2일 12:00 KST** 자동 실행되어 최신 월을 집계·커밋합니다.
즉시 실행하려면 Actions 탭에서 *Update exchange rate data → Run workflow*.
두 시크릿은 독립적이라 한쪽만 등록해도 해당 지표만 갱신되고 나머지는 시드가 유지됩니다.

시크릿 없이 1회 테스트하려면 `Run workflow`의 `api_key`(환율)·`bok_api_key`(금리·물가)
입력란에 키를 넣습니다. 공개 저장소에서는 실행 로그에 남으므로 사용 후 키 재발급을 권장합니다.

로컬 실행:

```bash
EXIM_API_KEY=<인증키> python3 exchange-rate/fetch_data.py
BOK_API_KEY=<인증키>  python3 exchange-rate/fetch_bok.py
```

## 집계 로직

**환율 (`fetch_data.py`)**
- 2024년 1월부터 현재 월까지 순회하되, **확정된 과거 월은 재호출하지 않고**
  최근 2개월(잠정치 보정)과 결측 월만 다시 집계해 API 호출 수를 아낍니다.
- 각 월의 **영업일(월~금)** 만 조회하며, 통화별 `deal_bas_r`를 모아 `avg/min/max`를 계산합니다.
- 비영업일·미공표일 응답(`[]`)은 건너뜁니다.
- **해외 IP 차단(302) 대응**: 수출입은행 API는 GitHub Actions(미국) IP를 차단합니다.
  전 영업일 순회 전 `probe_reachable()`로 도달 가능성을 확인해 차단 시 즉시 종료하며,
  `EXIM_PROXY_BASE`(국내 서울 리전 프록시 URL)를 설정하면 그 프록시를 경유해 우회합니다.
  프록시 배포·설정은 [`proxy/README.md`](./proxy/README.md) 참고.

**금리·물가 (`fetch_bok.py`)**
- 한국은행 기준금리(`722Y001`/`0101000`)와 소비자물가지수(`901Y009`/`0`)를 주기 `M`으로 조회합니다.
- 물가상승률(`cpiYoY`)은 CPI의 전년동월비이므로 12개월 이전(2023-01)부터 CPI를 받아 계산합니다.

## 출처

- [한국수출입은행 환율정보 Open API](https://www.koreaexim.go.kr/ir/HPHKIR019M01) — 현재환율(`data=AP01`), 매매기준율 `deal_bas_r`
- [한국은행 ECOS 경제통계시스템 API](https://ecos.bok.or.kr/) — 기준금리 `722Y001`, 소비자물가지수 `901Y009`
