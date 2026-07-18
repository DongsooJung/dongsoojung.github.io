# 월간 환율 분석 대시보드 · exchange-rate

한국수출입은행 **환율정보 Open API**의 일일 매매기준율(`deal_bas_r`)을 영업일 단위로
수집해 **월평균 · 월최저 · 월최고**로 집계한 원화 환율 대시보드입니다.
미국 달러(USD) · 일본 엔(JPY, 100엔 기준) · 유로(EUR) · 중국 위안(CNH)을 추적합니다.

- 대시보드: [`/exchange-rate/`](https://www.stargateedu.co.kr/exchange-rate/)
- 데이터: [`data.json`](./data.json) (프론트엔드가 로드, 실패 시 `fallback-data.js`)

## 구성

| 파일 | 설명 |
|------|------|
| `index.html` | Chart.js 대시보드 (통화·기간 필터, 월평균 라인+변동밴드, 상대강도 지수, 전월비, 표, CSV) |
| `fetch_data.py` | 수출입은행 API 수집 → 월간 집계 → `data.json`/`fallback-data.js` 생성 |
| `data.json` | 월별 통화별 `{avg, min, max}` 매매기준율 |
| `fallback-data.js` | `data.json` 로드 실패 시 사용하는 내장 폴백 |
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

1. [한국수출입은행 오픈API](https://www.koreaexim.go.kr/ir/HPHKIR019M01)에서 인증키 발급 (현재환율 서비스).
2. 저장소 **Settings → Secrets and variables → Actions**에 시크릿 `EXIM_API_KEY` 등록.
3. 이후 [`update-exchange-rate.yml`](../.github/workflows/update-exchange-rate.yml)이
   **매월 2일 12:00 KST** 자동 실행되어 최신 월을 집계·커밋합니다.
   즉시 실행하려면 Actions 탭에서 *Update exchange rate data → Run workflow*.

시크릿 없이 1회 테스트하려면 `Run workflow`의 `api_key` 입력란에 키를 넣습니다.
공개 저장소에서는 실행 로그에 남으므로 사용 후 키 재발급을 권장합니다.

로컬 실행:

```bash
EXIM_API_KEY=<인증키> python3 exchange-rate/fetch_data.py
```

## 집계 로직

- `fetch_data.py`는 2024년 1월부터 현재 월까지 순회하되, **확정된 과거 월은 재호출하지 않고**
  최근 2개월(잠정치 보정)과 결측 월만 다시 집계해 API 호출 수를 아낍니다.
- 각 월의 **영업일(월~금)** 만 조회하며, 통화별 `deal_bas_r`를 모아 `avg/min/max`를 계산합니다.
- 비영업일·미공표일 응답(`[]`)은 건너뜁니다.

## 출처

- [한국수출입은행 환율정보 Open API](https://www.koreaexim.go.kr/ir/HPHKIR019M01) — 현재환율(`data=AP01`), 매매기준율 `deal_bas_r`
