# 방한 외래관광객 대시보드 (중국 · 대만 · 베트남)

2024년 1월부터의 국적별 월별 방한 외래관광객 수를 보여주는 인터랙티브 시계열 대시보드입니다.

- **라이브**: https://www.stargateedu.co.kr/korea-tourism/
- **데이터**: 같은 폴더의 `data.json` (대시보드는 이 파일만 읽습니다)
- **출처**: 한국관광공사 한국관광 데이터랩 · 공공데이터포털 [출입국관광통계서비스](https://www.data.go.kr/data/15000297/openapi.do)

## 데이터 갱신 구조

```
공공데이터포털 API ──(매월 5일, GitHub Actions)──▶ data.json ──▶ 대시보드
```

`data.json`은 공표 통계 기반 시드 값으로 시작하며, GitHub Actions 워크플로
(`.github/workflows/update-tourism-data.yml`)가 매월 API를 호출해 최신 공표월까지
자동으로 덮어씁니다. API 키가 등록되기 전에는 시드 데이터로 동작합니다.

## API 키 등록 (1회 설정)

1. [공공데이터포털(data.go.kr)](https://www.data.go.kr) 회원가입 후 로그인
2. [출입국관광통계서비스](https://www.data.go.kr/data/15000297/openapi.do) 페이지에서 **활용신청** (자동 승인)
3. 마이페이지에서 **일반 인증키(Decoding)** 복사
4. 이 저장소 GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `TOUR_API_KEY`
   - Secret: 복사한 인증키
5. **Actions 탭 → Update tourism data → Run workflow**로 1회 수동 실행해 확인

이후에는 매월 5일에 자동으로 갱신됩니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 (Chart.js 4, 자체 완결형 정적 페이지) |
| `data.json` | 월별 통계 데이터 (시드 → API 자동 갱신) |
| `fetch_data.py` | API 호출·병합 스크립트 (표준 라이브러리만 사용) |

## 참고

- API 파라미터: `NAT_CD`(국적코드: 중국 112, 대만 125, 베트남 240), `ED_CD=E`(방한 입국), `YM`(YYYYMM)
- 통계 공표는 통상 익월 말~익익월 초에 이뤄지므로, 최근 1~2개월은 비어 있을 수 있습니다.
