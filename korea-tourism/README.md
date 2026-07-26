# 방한 외래관광객 대시보드 (중국 · 대만 · 베트남)

2010년 1월부터(기본)의 국적별 월별 방한 외래관광객 수를 보여주는 인터랙티브 시계열 대시보드입니다.
과거 백필이 필요하면 `START_YM=2005-01`처럼 시작 연월을 더 앞당길 수 있습니다.

- **라이브**: https://www.stargateedu.co.kr/korea-tourism/
- **데이터**: 같은 폴더의 `data.json` (대시보드는 이 파일만 읽습니다)
- **출처**: 한국관광공사 한국관광 데이터랩 · 공공데이터포털 [출입국관광통계서비스](https://www.data.go.kr/data/15000297/openapi.do)

## 데이터 갱신 구조

```
공공데이터포털 API ──(국내 PC에서 Run.bat 실행)──▶ data.json ──▶ 대시보드
```

`data.json`은 공표 통계 기반 시드 값으로 시작합니다.

> **⚠️ 해외 IP 차단**: data.go.kr / tour.go.kr는 해외 IP를 차단하므로 **GitHub Actions
> (해외 러너)에서는 API 호출이 실패**합니다(HTTP 500 / 타임아웃 확인됨). 따라서 실제
> 데이터 갱신은 **국내 네트워크의 PC에서** 아래 방법으로 실행합니다. Actions 워크플로는
> 남겨두었으며, 향후 접근이 허용되면 자동 갱신으로 전환됩니다.

## 국내 PC에서 데이터 갱신 (권장)

1. 이 저장소를 클론: `git clone https://github.com/DongsooJung/dongsoojung.github.io.git`
2. `korea-tourism\Run.bat` 더블클릭 (Windows PowerShell 내장 기능만 사용, 파이썬 불필요)
3. 인증키 입력 → 2010-01부터(결측·근사치·최근 3개월) 자동 수집 → git이 있으면 자동 커밋·푸시

명령줄로는:
```powershell
$env:TOUR_API_KEY="<인증키>"
# (선택) 더 과거부터: $env:START_YM="2005-01"
powershell -File korea-tourism\fetch_local.ps1
```

## API 키 등록 (1회 설정)

1. [공공데이터포털(data.go.kr)](https://www.data.go.kr) 회원가입 후 로그인
2. [출입국관광통계서비스](https://www.data.go.kr/data/15000297/openapi.do) 페이지에서 **활용신청** (자동 승인)
3. 마이페이지에서 **일반 인증키(Decoding)** 복사
4. 이 저장소 GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `TOUR_API_KEY`
   - Secret: 복사한 인증키
5. **Actions 탭 → Update tourism data → Run workflow**로 1회 수동 실행해 확인
   - 과거 구간을 한꺼번에 채우려면 `start_ym`(예: `2010-01` 또는 `2005-01`) 입력을 사용

이후에는 매월 5일에 자동으로 갱신됩니다. 확정된 과거 월은 재호출하지 않고, 최근 3개월·결측·근사치만 다시 수집합니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 (Chart.js 4, 자체 완결형 정적 페이지) |
| `data.json` | 월별 통계 데이터 (시드 → API 자동 갱신) |
| `fetch_data.py` | API 호출·병합 스크립트 — GitHub Actions용 (표준 라이브러리만 사용) |
| `Run.bat` / `fetch_local.ps1` | **국내 PC용 수집 스크립트** (PowerShell, 파이썬 불필요) |

## 참고

- API 파라미터: `NAT_CD`(국적코드: 중국 112, 대만 125, 베트남 240), `ED_CD=E`(방한 입국), `YM`(YYYYMM)
- 통계 공표는 통상 익월 말~익익월 초에 이뤄지므로, 최근 1~2개월은 비어 있을 수 있습니다.
