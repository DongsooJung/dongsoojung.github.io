# 방한 외래관광객 대시보드 (중국 · 대만 · 베트남)

2010년 1월부터 최신 공표월까지 국적별 월별 방한 외래관광객 수를 보여주는 인터랙티브 시계열 대시보드입니다.

- **라이브**: https://www.stargateedu.co.kr/korea-tourism/
- **데이터**: 같은 폴더의 `data.json` (대시보드는 이 파일만 읽습니다)
- **출처**: 한국관광공사 [한국관광 데이터랩](https://datalab.visitkorea.or.kr/) 공식 월별 한국관광통계 XLSX

## 데이터 갱신 구조

```
한국관광 데이터랩 공식 XLSX ──▶ 검증·변환 ──▶ data.json ──▶ 대시보드
```

`data.json`은 공식 파일의 `입국` 시트에서 중국·대만·베트남 월별 원값만 추출합니다.
파일 구조, 국가 행, 최신 월을 검증하며 실패 시 기존 값을 덮어쓰지 않습니다.

## 수동 데이터 갱신

1. 이 저장소를 클론: `git clone https://github.com/DongsooJung/dongsoojung.github.io.git`
2. `pip install openpyxl==3.1.5`
3. 아래 명령으로 최신 공식 공표 파일을 자동 탐색·변환

명령줄로는:
```bash
python korea-tourism/import_kto_workbook.py
# 또는 공식 XLSX URL/로컬 경로를 첫 번째 인자로 지정
```

Actions는 매월 27일 최신 공표 파일을 탐색해 갱신합니다. `workflow_dispatch`의
`source_url`에 공식 XLSX 주소를 넣어 특정 공표본을 다시 반영할 수도 있습니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 (Chart.js 4, 자체 완결형 정적 페이지) |
| `data.json` | 공식 XLSX에서 변환한 월별 통계 데이터 |
| `import_kto_workbook.py` | 최신 공식 XLSX 탐색·검증·변환 스크립트 |

## 참고

- 통계 공표는 통상 익월 말~익익월 초에 이뤄지므로, 최근 1~2개월은 비어 있을 수 있습니다.
