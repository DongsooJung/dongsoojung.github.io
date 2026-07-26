# CLASS101 공개 추천 라인업 아카이브

CLASS101 한국어 공개 랜딩 페이지에 노출되는 추천 클래스와 크리에이터,
카테고리, 섹션 순위를 매일 JSON으로 기록합니다.

## 수집 범위

- 출처: <https://class101.net/ko/pages/everything-class101>
- 대상: 비로그인 상태에서 공개되는 추천·인기 섹션
- 제외: 로그인 전용 정보, 수강 콘텐츠, 결제·회원 정보, 전체 카탈로그
- 중복 처리: 같은 클래스가 여러 섹션에 나와도 클래스 ID 기준 한 번만 저장하고
  `sections`와 `sectionRanks`에 노출 위치를 합칩니다.

## 로컬 실행

```powershell
python class101/fetch_class101.py
```

출력 파일:

- `data/latest.json`
- `data/history/YYYY-MM-DD.json`
- `data/archives.json`

GitHub Actions의 `update-class101-daily.yml`이 매일 09:30 KST에 실행해
변경된 데이터 파일을 `main` 브랜치에 커밋합니다.
