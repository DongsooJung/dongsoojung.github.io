# 스타게이트AI 운영 연결 현황

확인일: 2026-10-20 (한국시간)

## 반영한 기능

- 연결 채널: 스타게이트AI / 검색용 아이디 stargateai / 공개 ID _vNJVX.
- 고객관리·문자 작성 화면의 채널 홈·상담 주소와 공유 문구를 새 채널로 변경. 채널 추가 버튼도 제공.
- 카카오 스킬 서버: POST https://stargate.stargate8225.workers.dev/api/kakao/skill
- AI 엔진: Cloudflare Workers AI의 @cf/qwen/qwen3-30b-a3b-fp8. 별도 AI 제공자 API 키 없이 기존 Worker의 AI 바인딩 사용.
- 인사·서비스 안내·상담 요청·채널 안내 메뉴는 고정 응답. 일반 서비스 질문은 실제 AI 호출.
- x-api-key 헤더 인증, 본문 크기·발화 길이 검증, 한국시간 기준 전체 하루 50회·사용자별 하루 10회 AI 호출 제한 적용.
- AI 호출이 3.3초를 넘기거나 실패하면 고정 안내. 연락처 등 식별 가능한 패턴은 AI에 보내지 않고 안내.
- 고객 목록 조회, 문자·알림톡 자동 발송, 예약 확정·결제·환불·상담원 전환 실행 권한은 챗봇에 없음.
- 기존 정적 파일과 서버 설정·비밀키를 보존한 서버 코드 배포. 운영 자료·구현 대조 영역 숨김 유지.

## 관리자 연결 화면

https://stargate.stargate8225.workers.dev/admin/kakao/

기존 Cloudflare Access 관리자 로그인이 필요하다. 이 화면에서 URL / Test URL, 헤더 이름과 인증값을 복사할 수 있다. 인증값은 서버 비밀 설정과 Git 제외된 로컬 .wrangler/kakao-connection.private.json에 보관한다. 공개 문서·커밋·채팅에 인증값을 넣지 않는다.

카카오 챗봇 관리자센터 https://i.kakao.com/ 에서:

1. 기존 스타게이트AI 봇을 선택하거나 새 봇을 생성한다.
2. 스킬 ‘스타게이트AI 상담’을 생성하고 위 스킬 주소를 URL과 Test URL에 입력한다.
3. 헤더값과 테스트 헤더값 모두 x-api-key 및 관리자 화면에서 복사한 인증값으로 설정한다.
4. 웰컴·폴백 블록과 서비스 안내·상담 요청·채널 안내 블록 응답에 해당 스킬을 적용한다.
5. 봇 테스트로 응답을 확인한다.
6. 스타게이트AI(stargateai / _vNJVX)를 운영 채널로 연결하고 배포한다.
7. https://pf.kakao.com/_vNJVX/chat 에서 인사와 일반 질문을 각각 보내 실제 카카오 대화 수신을 확인한다.

이 문서는 스킬 서버 배포 성공과 실제 카카오 채널 배포를 구분한다. 카카오 관리자센터의 봇 생성·연결·배포는 아직 수행·확인하지 않았다.

## 알림톡의 남은 설정

운영 서버에서 SOLAPI 채널 목록을 실제 조회한 결과, 스타게이트AI/stargateai 채널은 연결되어 있지 않았다. 비즈니스 채널 상태를 확인하고 SOLAPI에서 해당 검색용 아이디로 연결한 뒤 소유자 인증을 완료해야 한다. 상담 접수·예약 확정·예약 변경 문안은 검수용 초안이며 실제 템플릿 제출·승인은 수행하지 않았다.

채널 연결·템플릿 승인 후 고객관리의 카카오 알림톡 메뉴에서 설정을 다시 불러온다. 이 작업 중 고객 대상 문자·알림톡은 발송하지 않았다.

## 검증 결과

- node --test tests/kakao-chatbot.test.mjs tests/solapi-kakao.test.mjs tests/cloudflare-access.test.mjs: 20개 통과.
- 운영 스킬 서버 인사 응답 HTTP 200, Kakao version 2.0 형식 확인.
- 운영 AI 일반 질문 답변 HTTP 200, 약 1.3~1.7초, generated 집계 확인. 고정 응답을 AI 성공으로 기록하지 않음.
- 인증 헤더 없는 요청 HTTP 401 확인.
- 관리자 연결 화면은 인증 전 Cloudflare Access 로그인으로 이동함을 확인.
- 고객관리 HTTP 200, 새 채널 링크, 기존 대조 안내 숨김, 문자 입력 폼 유지 확인.
- 운영 카카오 채널에서 주고받는 최종 대화는 아직 미확인.

공식 참고: [카카오 스킬·헤더 설정](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/make_skill), [Workers AI 모델](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/).


## 채널 연결 후속 확인 · 2026-10-20

SOLAPI 운영 계정에서 스타게이트AI(stargateai) 채널 연결을 확인했다. 발신프로필 ID는 KA01PF261020100231334ZRvICJuF1sm이며, 승인된 알림톡 템플릿은 현재 0개다. 기존의 SOLAPI 미연결 안내는 이 확인으로 갱신한다. 카카오 챗봇의 생성·스킬 설정·운영 채널 배포는 별도이며 아직 확인하지 않았다.
