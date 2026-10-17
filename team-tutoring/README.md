# 강남 그룹 과외 — 구글 맵 기반 팀과외 앱

강남(대치동) 기반 그룹 과외 마켓플레이스 앱 프로젝트. 지도 스택은 **Google Maps
(`react-native-maps` / `PROVIDER_GOOGLE`)**, 인증은 **Google Sign-In → Firebase Auth**.

## 구성

| 경로 | 내용 |
|------|------|
| [`docs/PROMPT_GROUP_TUTORING_APP.md`](docs/PROMPT_GROUP_TUTORING_APP.md) | 전체 앱 명세서 (기능·Firestore 스키마·Security Rules·Cloud Functions·산출물 목록) |
| [`mobile/`](mobile/) | React Native (Expo) 최소 실행 골격 — 화면 스텁 + 내비게이션 + Google Maps 지도 |

## 프로젝트 이력

- 명세서 원본은 `DongsooJung/daechi-monitor` 저장소에서 작성됨
  (카카오맵 → 구글맵 전환: [daechi-monitor PR #1](https://github.com/DongsooJung/daechi-monitor/pull/1),
  커밋 `2f0ba52`).
- 이후 개발은 이 저장소(`team-tutoring/`)에서 이어서 진행.

## 다음 단계

1. `mobile/.env.example` 기준으로 Firebase / Google Maps API Key / Google Sign-In
   OAuth Client ID 발급 및 `.env` 구성 (`mobile/README.md` 참고)
2. Firebase Auth 연동 (`signInWithCredential` + Google idToken)
3. Firestore `classes` 컬렉션 + `geohash` 반경 검색 (`geofire-common`)
4. 지도 마커 클러스터링·수업 생성·참여요청/승인·채팅·FCM — 명세서 순서대로 구현
