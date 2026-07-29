# 법원경매 부동산 데이터 수집기 + 대시보드 (2026)

대한민국법원 [법원경매정보](https://www.courtauction.go.kr)의 **주택(주거용 건물)**
(아파트·단독·다가구·다세대·연립·오피스텔·주상복합)과 **상업용 건물**
(근린생활시설·상가·점포·사무실·숙박시설 등) 경매 물건을
**공고일 기준**으로 2026년 월별 수집해:

1. **엑셀** — `output/법원경매_주택_2026.xlsx`, `output/법원경매_상업용_2026.xlsx`
   (전체 / 월별요약 / 월별 시트)
2. **대시보드** — `index.html` + `data.json`(주택) + `data_commercial.json`(상업용)
   — 정적 페이지, GitHub Pages에서 바로 열람, 상단 토글로 구분 전환

로 저장하는 프로그램입니다.

## 사용법

```bash
pip install requests openpyxl

# 주택 + 상업용 모두, 2026년 1월 ~ 현재 월 수집 (공고일 기준)
python3 fetch_court_auction.py

# 특정 구분만 수집
python3 fetch_court_auction.py --category 주택
python3 fetch_court_auction.py --category 상업용

# 일간 증분 수집 — 기존 데이터에 오늘 새로 등록된 물건만 append (매일 실행용)
python3 fetch_court_auction.py --daily

# 데이터가 있는 가장 최근 월만 수집
python3 fetch_court_auction.py --latest

# 특정 월만 수집
python3 fetch_court_auction.py --month 2026-06

# 네트워크 없이 샘플 데이터로 전체 파이프라인 실행
python3 fetch_court_auction.py --sample
```

### 국내 PC에서 원클릭 실행 (권장)

해외 IP 차단 때문에 실데이터 수집은 **국내 네트워크 PC**에서 해야 합니다.
아래 실행 스크립트를 쓰면 Python 확인 → 패키지 설치 → 수집 → (선택)커밋·푸시까지
자동으로 진행됩니다. `court-auction` 폴더 안에서 실행하세요.

- **Windows**: `run_domestic.bat` 더블클릭
  (실행 방식 선택: `1` 전체 백필 / `2` 일간 증분)
- **mac / Linux**: `./run_domestic.sh` (또는 `bash run_domestic.sh daily`)

스크립트는 수집 후 "GitHub에 커밋·푸시할까요?"를 물어봅니다. `y`를 누르면
`data.json`/엑셀 변경분이 커밋·푸시되어 GitHub Pages 재배포 후 라이브 대시보드
(`stargateedu.co.kr/court-auction/`)에 실데이터로 반영됩니다. (git 로그인·푸시 권한 필요)

> 파일 인코딩: `run_domestic.bat`은 ASCII 런처, 한글 안내는 `run_domestic.ps1`
> (UTF-8 BOM)에 있어 한국어 Windows에서 글자가 깨지지 않습니다.

### 매일 자동 수집 (일간 대시보드용)

`--daily`는 기존 `data.json`/`data_commercial.json`을 읽어 **최근 공고를 재조회하고
아직 없는(신규) 물건만** `수집일 = 오늘`로 붙여 누적합니다(같은 날 재실행해도 중복
없음). 국내 네트워크 PC에서 cron으로 매일 돌리면 "매일 새로 등록되는 경매"가
쌓이고, 대시보드의 **일간 보기**가 이를 시각화합니다.

**Windows — 작업 스케줄러 원클릭 등록 (권장):**
국내 PC에서 `schedule_daily.bat` 을 실행하면 매일 오전 8시에
`일간 증분 수집 → 커밋 → 푸시` 를 무인으로 도는 예약 작업(`CourtAuctionDaily`)이
등록됩니다. 해제는 `schedule_daily.bat remove`. 신규 물건이 없는 날은 커밋을
건너뛰므로 빈 커밋이 쌓이지 않습니다.

**mac / Linux — cron 예시:**
```cron
# 매일 오전 8시 수집 후 커밋·푸시
0 8 * * *  cd /path/to/court-auction && \
  ./run_domestic.sh daily && git -C .. add court-auction && \
  git -C .. commit -m "chore: court auction daily $(date +\%F)" && git -C .. push
```

> GitHub Actions 등 해외 클라우드 러너에서 돌리면 법원경매정보가 해외 IP를 차단하므로
> 수집이 실패합니다. 자동화는 반드시 **국내 네트워크** 환경에서 실행하세요
> (원한다면 국내 PC에 GitHub self-hosted 러너를 설치해 CI로 돌리는 것도 가능합니다).

실행하면 구분별 엑셀과 JSON이 갱신되고, 대시보드(`index.html`)는 JSON을 읽어
자동으로 최신 내용을 표시합니다.

로컬에서 대시보드를 열 때는 간단한 서버를 띄워 주세요
(브라우저의 `file://` 보안 제한 때문에 fetch가 차단됩니다):

```bash
python3 -m http.server 8000
# → http://localhost:8000/court-auction/
```

## 대시보드 기능

- **구분 토글**: 주택 / 상업용 전환 — 모든 KPI·차트·표·엑셀 다운로드가 함께 전환
- **보기 토글**: 월간 / 일간 전환
  - **월간 보기**: 물건 수(전월 대비 증감)·평균 감정가/최저매각가/유찰횟수 KPI,
    월별 공고 추이(막대 클릭으로 월 선택), 용도별·시도별·감정가 구간 분포
  - **일간 보기**: 최근 등록일 신규·최근 7일·일평균·최다 등록일 KPI,
    **일별 신규 등록 추이(면적+선, 크로스헤어 툴팁)**, 요일별 신규 등록,
    최근 7일 일별 신규, 최근 신규 등록 목록(수집일 기준 정렬).
    기간(최근 30/60/90일/전체) 필터로 범위 조절
- **필터**: 시도 / 용도 + (월간)공고월 / (일간)기간 — 모든 차트·표에 일괄 적용
- **표**: 물건 목록(열 정렬, 페이지네이션) — `공고일`·`수집일` 포함
- 라이트/다크 모드 자동 지원, 외부 라이브러리 없음(순수 SVG)

> **등록일/수집일** — 각 물건은 `공고일`(법원 공고 게시일)과 `수집일`(우리 수집기가
> 처음 기록한 날)을 함께 가집니다. 일간 보기의 "신규 등록"은 `수집일` 기준이며,
> 최초 백필·샘플에서는 `수집일 = 공고일`로 채워집니다.

## 주의사항

- **해외 IP 차단**: 법원경매정보 사이트는 해외 IP를 차단하므로 실데이터 수집은
  국내 네트워크에서 실행해야 합니다. 현재 커밋된 JSON/엑셀은
  `--sample`로 생성한 **샘플 데이터**이며, 대시보드에 "샘플 데이터" 배지가 표시됩니다.
- **API 변경 가능성**: 비공식 내부 API를 사용하므로 사이트 개편 시 요청/응답
  필드명이 바뀔 수 있습니다. 이 경우 브라우저 개발자도구(F12) → Network 탭에서
  "물건상세검색" 요청을 확인해 `fetch_court_auction.py` 상단의
  `API_URL` / `CATEGORIES`(용도 코드) / `build_payload()` / `FIELD_CANDIDATES` 를
  갱신하면 됩니다.
- **호출 예절**: 요청 간 1초 지연을 두며, 필요 이상으로 호출하지 않습니다.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `fetch_court_auction.py` | 수집기 (API 호출 → 정규화 → 엑셀/JSON 저장; `--category` 구분, `--daily` 일간 증분) |
| `run_domestic.bat` / `.ps1` | 국내 Windows 원클릭 실행기 (설치→수집→커밋·푸시). `daily push` 인자로 무인 실행 |
| `run_domestic.sh` | 국내 mac/Linux 원클릭 실행기 |
| `schedule_daily.bat` / `.ps1` | Windows 작업 스케줄러에 매일 자동 수집 등록/해제 |
| `data.json` | 대시보드용 데이터 — 주택 |
| `data_commercial.json` | 대시보드용 데이터 — 상업용 |
| `index.html` | 정적 대시보드 (주택/상업용 토글) |
| `output/법원경매_주택_2026.xlsx` | 엑셀 결과물 — 주택 |
| `output/법원경매_상업용_2026.xlsx` | 엑셀 결과물 — 상업용 |
