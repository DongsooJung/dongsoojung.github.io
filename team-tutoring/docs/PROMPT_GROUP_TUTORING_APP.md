# Codex Prompt for 강남 그룹 과외 위치기반 앱 (한국어 상세 주석 버전)
<!-- 이 문서는 Cursor / GitHub Copilot / OpenAI Codex / Claude Code 등에서 붙여넣기 하면
     프로덕션 수준의 "React Native + Firebase 기반 위치 기반 그룹 과외 서비스" 앱을 자동 생성하도록 설계된 명세서입니다.
     개발자뿐 아니라 PM/기획자도 이해할 수 있도록 각 명령과 설정에 한국어 해설을 함께 붙였습니다. -->

You are an expert full-stack mobile engineer. 
Generate a production-ready React Native (Expo) app scaffold for a location-based GROUP TUTORING marketplace targeting Gangnam (Seoul), styled like Danggeun Market (Carrot Market) but in a strict black/white theme.
<!-- 역할 지정: 숙련된 모바일 엔지니어로 가정하여, 전체 앱 구조 및 코드 생성을 요청하는 지시문 -->
<!-- 목표 앱: "강남(특히 대치동) 지역에서 그룹 과외를 찾거나 개설할 수 있는 위치 기반 서비스" -->
<!-- 디자인 철학: 당근마켓 스타일(간결한 레이아웃 & 여백 중심) + 완전한 흑백(모노크롬) 테마 -->

---

### Tech & Libraries
- React Native + Expo (SDK latest)
  <!-- iOS/Android 동시 개발을 위한 모바일 프레임워크. Expo를 사용하여 초기 설정과 빌드를 단순화 -->
- TypeScript
  <!-- 유지보수성과 타입 안정성을 위한 기본 선택 -->
- Navigation: @react-navigation/native (stack + bottom-tabs)
  <!-- 인증 플로우(스택) + 메인 화면(Tab) 구조로 설계 예정 -->
- State: Choose **one**: Zustand **or** React Query (be consistent)
  <!-- 전역 상태 관리 도구. 둘 중 1가지만 택해서 혼합 사용 금지 -->
- UI: nativewind (Tailwind-in-RN) + minimal design system
  <!-- RN에서 Tailwind 문법처럼 className으로 스타일 적용 가능. 재사용 UI 컴포넌트 기반 -->
- Icons: react-native-vector-icons
  <!-- 흑백 테마에 어울리는 단색 아이콘 -->
- Forms: react-hook-form + zod
  <!-- 폼 데이터 상태 및 유효성 검사를 체계적으로 처리 -->
- Maps: react-native-maps (Google Maps provider) with marker clustering (e.g., react-native-map-clustering)
  <!-- iOS/Android 공용 Google Maps SDK 래퍼. PROVIDER_GOOGLE 지정 + 다중 마커 시 클러스터 -->
- Firebase: Auth, Firestore, Cloud Functions, Cloud Messaging (FCM), Storage
  <!-- 인증 / 데이터 / 서버리스 로직 / 푸시 알림 / 이미지 저장 등 백엔드 풀스택 구성 -->
- Geo: geofire-common (geohash + distance queries)
  <!-- Firestore에서 지리 기반 반경 검색(near query) 구현 필수 도구 -->

---

### Product Requirements (Gangnam group tutoring)
User roles:
- Student/Parent (find & join nearby group classes)
- Tutor (create & manage group classes)
<!-- 역할 2가지 정의: '학생/학부모'는 수업을 검색 후 참여 / '튜터'는 수업 생성 및 관리 -->

Core features (MVP):

1) **Onboarding & Auth**
   - Email/Password sign-in <!-- 이메일 로그인 (테스트용 및 대안 로그인 수단) -->
   - Google Sign-In → Firebase Auth (`GoogleAuthProvider` credential) flow
     <!-- Google Sign-In SDK로 ID 토큰 획득 후 Firebase Auth 크리덴셜로 직접 로그인 (커스텀 토큰 불필요) -->
   - Profile creation:
     role, name, school/major (for tutors), grade range (for students), phone (optional, masked)
     <!-- 최초 가입 시 역할 및 기본 정보 수집 -->

2) **Home / Map**
   - Google map centered in Gangnam (default Daechi-dong)
     <!-- 기본 지도(Google Maps, PROVIDER_GOOGLE)를 대치동 중심 좌표 기준으로 표기 -->
   - Display nearby "group classes" within radius (default 2km)
     <!-- 주변 반경 내 수업 목록을 마커로 표기 -->
   - Marker cluster; tapping marker → preview card → detail screen
     <!-- 마커 탭하면 요약 카드 → 상세 페이지 이동 -->
   - Pull-to-refresh & infinite scroll in a list view tab ("Nearby")
     <!-- 지도 기반 외 리스트 기반으로도 탐색 가능 -->

3) **Filter / Search**
   - Subject (Math, English, Science, Korean, Social, etc.)
   - Grade (Elem/Middle/High)
   - Schedule (weekday/weekend, time range)
   - Price range per session
   - Capacity (max participants)
   - Toggle: “Recruiting only” (hide closed groups)
<!-- 필터 UI는 Chip/슬라이더 기반. 최종 결과는 클라이언트에서 교차 필터링 -->

---

## 1) Onboarding & Auth (상세)
<!-- 인증 및 온보딩 플로우의 화면/함수/데이터 규칙을 구체화 -->

### Screens
- Onboarding.tsx
  <!-- 앱 소개/권한(알림/위치) 안내. 최초 1회 표시 후 로컬 플래그 저장 -->
- Auth/SignIn.tsx, Auth/SignUp.tsx
  <!-- 이메일 로그인/회원가입. react-hook-form + zod로 필드 검증 -->
- Auth/GoogleSignInButton.tsx
  <!-- Google Sign-In SDK 연동 버튼 컴포넌트. ID 토큰 취득 후 Firebase Auth 크리덴셜 로그인 래핑 -->

### Client Flow
1. User taps GoogleSignInButton → `@react-native-google-signin/google-signin`으로 ID 토큰 획득
   <!-- iOS/Android 공용 Google Sign-In SDK. GoogleSignin.signIn() → idToken -->
2. Build Firebase credential: `GoogleAuthProvider.credential(idToken)`
   <!-- Firebase SDK 자체 지원 — 별도 Cloud Function 없이 클라이언트에서 크리덴셜 생성 -->
3. `signInWithCredential(auth, credential)` → Firebase 사용자 세션 확립
   <!-- 최초 로그인 시 Firebase가 users/{uid}를 관리 (Firestore users 문서는 별도 생성) -->
4. If first login (Firestore `users/{uid}` 부재) → route to Profile setup
   <!-- 신규 유저는 프로필 작성 화면으로 이동 -->

### Profile Setup
- Required: role, name
  <!-- 필수 항목. role은 'tutor' 또는 'student' -->
- If tutor: school, major (optional), verification flag default false
  <!-- 튜터 정보 확장 필드. 검증은 관리자 수동 처리 전제 -->
- If student: grade range
  <!-- 학생/학부모용 대상 학년 범위 지정 -->
- Optional: phone (stored masked)
  <!-- 개인정보 최소화 원칙. 표시 시 마스킹 처리 -->
- Save under `users/{uid}` with createdAt/updatedAt
  <!-- 서버시간(serverTimestamp)로 이력 관리 -->

### Validation & UX
- zod schemas for email/password/name/phone
  <!-- 형식/길이/패턴 제약 통일 -->
- Error toasts for network/auth failures
  <!-- 사용자에게 명확한 실패 사유 노출 -->
- Keep UI monochrome (no color accents)
  <!-- 흑백 테마 유지: 강조는 굵기/레이아웃/음영으로 표현 -->

---

## 2) Home / Map (상세)
<!-- 지도 중심 홈 경험과 리스트 뷰의 동작, 데이터 흐름, 성능 고려사항 명시 -->

### Screens
- HomeMap.tsx
  <!-- Google Maps(PROVIDER_GOOGLE)/현재 위치 버튼/마커 클러스터/프리뷰 바텀시트 포함 -->
- NearbyList.tsx
  <!-- 거리순 카드 리스트. 무한 스크롤 + 당근마켓 유사 압축 카드 -->

### Data flow
- classes 컬렉션(geohash 포함)에서 반경 검색
  <!-- geofire-common으로 쿼리 키 범위 계산 → Firestore compound 쿼리 -->
- Client calculates exact distance for sort
  <!-- 클라에서 하버사인 거리 계산으로 최종 정렬 -->
- Pagination via startAfter (createdAt or distance bucket)
  <!-- 페이징 기준키 선택: createdAt 기본, 거리 버킷 혼합 가능 -->

### Interactions
- Tap marker → show preview card (title/price/distance/schedule)
  <!-- 미리보기 카드 → 상세 페이지로 이동 버튼 포함 -->
- Drag bottom sheet to expand to list
  <!-- 지도-리스트 전환의 자연스러운 UX -->
- Pull to refresh on both map & list
  <!-- 실시간성 강화: 새 게시 탐색 용이 -->

### Performance
- Use marker clustering
  <!-- 마커 수 많을 때 프레임 드랍 방지 -->
- Memoize card rows; windowed list
  <!-- FlatList windowSize/tuning으로 렌더 최적화 -->
- Debounce filter changes before query
  <!-- 필터 값 변경 시 쿼리 폭주 방지 -->

### Empty/Errors
- EmptyState component with guidance
  <!-- "주변에 모집 중인 수업이 없어요" 등 안내 -->
- Retry button on network errors
  <!-- 일시적 장애 대응 -->

---

## 3) Filter / Search (상세)
<!-- 필터 스키마/폼 상태/적용 전략을 명확히 규정 -->

### Form & Schema
- react-hook-form + zod
  <!-- 필터 폼 상태 관리 및 타입 안전성 -->
- Fields:
  - subject: enum('math','eng','sci','kor','soc','etc')
    <!-- 과목 셀렉터/칩 -->
  - grade: enum range { min:'elem'|'mid'|'high', max:'elem'|'mid'|'high' }
    <!-- 범위형 학년: 교차 검증(min ≤ max) -->
  - schedule: { days: string[], timeRange: { start: 'HH:mm', end: 'HH:mm' } }
    <!-- 요일 배열 + 시간 문자열. zod로 유효성 체크 -->
  - priceRange: [min,max] number
    <!-- 최소/최대 가격 범위 -->
  - capacity: number
    <!-- 정원 기준 -->
  - recruitingOnly: boolean (default true)
    <!-- 기본값으로 '모집중만' 표기 -->

### Apply Strategy
- Client-side refine after Firestore geo query
  <!-- 1차: 반경으로 가져오고 2차: 과목/학년/가격 필터링 -->
- Persist last-used filters in storage
  <!-- 로컬 스토리지/AsyncStorage로 사용자 편의성 -->
- Sticky filter bar on list
  <!-- 스크롤 시에도 항상 접근 가능 -->

### UX Notes
- Chips for quick toggles, sliders for ranges
  <!-- 터치 친화적 UI -->
- Show active filter count (e.g., “Filters (3)”)
  <!-- 적용 상태를 즉시 인지 -->
- Reset to defaults easily
  <!-- 초기화 버튼 제공 -->

---

## 4) Create / Manage Class (Tutor)
<!-- 튜터가 그룹 과외 수업을 개설하고 수정/모집 상태를 변경하고, 참여 요청을 관리하는 흐름 정의 -->

### Screens
- ClassCreate.tsx
  <!-- 수업 생성 폼. react-hook-form + zod 기반 -->
- ClassEdit.tsx
  <!-- 기존 데이터 불러와 수정 가능 -->
- Requests.tsx (for Tutor)
  <!-- 참여 요청 목록 화면. 승인/거절 버튼 포함 -->

### Form Fields
- subject: enum('math','eng','sci','kor','soc','etc')
  <!-- 과목 선택 -->
- grade: { min:'elem'|'mid'|'high', max:'elem'|'mid'|'high' }
  <!-- 대상 학년 범위 -->
- pricePerSession: number
  <!-- 1회당 금액 (예: 30000) -->
- schedule: { days: string[], timeRange: { start: 'HH:mm', end: 'HH:mm' } }
  <!-- 요일 + 시간대 범위 -->
- location: { lat:number, lng:number, address?:string }
  <!-- 지도에서 핀 지정. Google Maps onLongPress 이벤트 활용 -->
- geohash: string
  <!-- geofire-common으로 생성하여 Firestore 저장 -->
- maxParticipants: number
  <!-- 정원 -->
- photos: string[] (Storage URLs)
  <!-- 이미지 다중 업로드 (Storage 업로드 → URL 배열로 저장) -->
- description: string
  <!-- 수업 상세 설명 (예: 커리큘럼/준비물 등) -->
- recruiting: boolean (default true)
  <!-- 모집중 상태. false이면 리스트/지도에서 필터링 제거 -->

### UX
- Save Draft (optional) or Publish
  <!-- 초안 저장 가능하게 할지 여부는 선택 사항 -->
- Editing allowed only if recruiting == true
  <!-- 모집 중일 때만 수정 가능. 마감 후 수정 제한 권장 -->
- Preview mode before publish
  <!-- 게시 전 최종 검토 화면 -->

### Firestore Writes
- On create: add to `classes/{classId}` with serverTimestamp()
  <!-- Firestore addDoc 사용 -->
- On update: check tutorId matches current user
  <!-- Security Rules & 클라 코드 둘 다 확인 -->

### Image Upload
- Use Expo ImagePicker
  <!-- 사진 선택 또는 촬영 -->
- Compress before upload
  <!-- 용량 최소화 (예: expo-image-manipulator) -->
- Upload to Firebase Storage under `classPhotos/{classId}/{uuid}.jpg`
  <!-- Storage 구조 통일 -->

---

## 5) Join / Request / Chat
<!-- 학생/학부모가 수업에 참여 신청하고 튜터가 승인하며, 승인 후 채팅이 열리는 플로우 정의 -->

### Request Flow
1. Student taps "Request to Join" on ClassDetail
   <!-- 요청 시 간단한 메시지(Optional) 입력 가능하게 -->
2. Create doc in `enrollRequests/{reqId}`:
   - classId, studentId, status:'pending', message, createdAt
   <!-- 상태 초기값은 pending -->
3. Tutor sees list in Requests.tsx
   <!-- 대기중 요청 목록 표시 -->

### Approval Flow
- Tutor taps Approve → status:'approved'
  <!-- UI에서 버튼 액션으로 상태 변경 -->
- On approval:
  - Create doc in `enrollments/{enrollId}` with classId, studentId, approvedAt
    <!-- 수업과 학생의 관계를 기록 -->
  - Open or create chat between tutor & student
    <!-- 채팅방이 없는 경우 Firestore chats에 생성 -->
  - Send FCM push notification to student
    <!-- Cloud Function에서 트리거 -->

### Deny Flow
- Tutor taps Deny → status:'denied'
  <!-- 단순 상태 변경 및 알림 -->

### Chat System
- ChatList.tsx, ChatRoom.tsx
  <!-- Firestore 실시간 listener로 구현 -->
- Collection:
  - chats/{chatId}
    - members: [tutorId, studentId]
    - classId (optional, link back)
    - lastMessage, lastTs
  - chats/{chatId}/messages/{msgId}
    - senderId, text, imageUrl?, createdAt
  <!-- 기본 텍스트 + 이미지 전송 지원 -->

### Notifications
- When new message created → notify other member(s) via FCM
  <!-- 읽지 않은 대화에 대한 알림 처리 -->
- Foreground / background handlers on client
  <!-- react-native-firebase/messaging 활용 -->

---

## 6) Safety & Reporting
<!-- 서비스 신뢰 확보를 위한 기본 신고/검증 기능 -->

### Report Flow
- In ClassDetail or UserProfile → "Report" button
  <!-- 수업 또는 사용자에 대해 신고 가능 -->
- Create doc in `reports/{reportId}`:
  - targetType: 'user' | 'class'
  - targetId
  - reason (enum or free text)
  - detail? (optional)
  - reporterId
  - createdAt
  <!-- Firestore에 누가 무엇을 왜 신고했는지 기록 -->
- No immediate UI action required; admin review later
  <!-- 초기에는 단순 수집만. 추후 관리자용 콘솔 확장 가능 -->

### Verification (Tutor)
- Field in users: tutorProfile.verified:boolean (default false)
  <!-- 검증 여부는 관리자 수동 지정 전제 -->
- Display badge "Verified Tutor" on profile & class cards
  <!-- 사용자가 신뢰할 수 있는 시각적 요소 -->

---

## 7) My Page
<!-- 개인 정보를 편집하고, 내가 만든/참여한 수업을 확인하는 허브 -->

### Screens
- Profile.tsx
  <!-- 이름/역할/학교정보/전화번호/알림 설정 확인 & 수정 -->
- Settings.tsx
  <!-- 알림 토글, 다크모드 토글(흑백 기반), 로그아웃 -->
- MyClasses.tsx (if Tutor)
  <!-- 내가 개설한 수업 목록 + 상태 표시(모집중/마감/참여자 수) -->
- MyEnrollments.tsx (if Student)
  <!-- 내가 참여 중인 수업 목록 -->

### UX
- Profile photo optional (Storage upload)
  <!-- 사진 등록 시에도 흑백 필터 적용 가능 -->
- Role switching disallowed after creation
  <!-- 초기 역할은 고정. 변경하려면 관리자 문의 -->

---

## Firestore Schema (정리)

```txt
users/{uid}:
  role: 'tutor'|'student'
  name: string
  phoneMasked?: string
  photoURL?: string
  tutorProfile?: { school?:string, major?:string, verified:boolean }
  createdAt, updatedAt

classes/{classId}:
  tutorId: string
  subject: 'math'|'eng'|'sci'|'kor'|'soc'|'etc'
  grade: { min, max }
  pricePerSession: number
  schedule: { days: string[], timeRange: { start, end } }
  location: { lat, lng, address? }
  geohash: string
  radiusMeters: number
  maxParticipants: number
  photos: string[]
  description: string
  recruiting: boolean
  createdAt, updatedAt

enrollRequests/{reqId}:
  classId, studentId
  status: 'pending'|'approved'|'denied'
  message?: string
  createdAt, updatedAt

enrollments/{enrollId}:
  classId, studentId
  approvedAt

chats/{chatId}:
  members: string[]
  classId?
  lastMessage, lastTs
chats/{chatId}/messages/{msgId}:
  senderId, text, imageUrl?, createdAt

reports/{reportId}:
  targetType, targetId, reason, detail?, reporterId, createdAt
```

---

## Firestore Security Rules (요약)

```txt
match /users/{uid} {
  allow read: if request.auth != null; // 단, 최소 정보만 노출
  allow write: if request.auth.uid == uid;
}

match /classes/{classId} {
  allow read: if true;
  allow create: if request.auth != null && get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'tutor';
  allow update, delete: if request.auth.uid == resource.data.tutorId;
}

match /enrollRequests/{reqId} {
  allow create: if request.auth.uid == request.resource.data.studentId;
  allow read: if request.auth.uid == resource.data.studentId
                || request.auth.uid == get(/databases/(default)/documents/classes/$(resource.data.classId)).data.tutorId;
  allow update: if request.auth.uid == get(/databases/(default)/documents/classes/$(resource.data.classId)).data.tutorId;
}

match /chats/{chatId} {
  allow read, write: if request.auth.uid in resource.data.members;
}
```

> ※ 실제 구현 시 각 필드의 타입/길이/enum 범위 등 **세부 유효성 검사**를 `request.resource.data`로 추가하세요.

---

## Cloud Functions (필수 트리거 요약)

| Trigger | Action |
|---------|--------|
| onCreate(enrollRequests) | 튜터에게 FCM 알림 전송 |
| onUpdate(enrollRequests.status:'approved') | 학생에게 알림 전송 + 채팅방 생성 또는 연결 |
| onCreate(messages) | 채팅방의 다른 멤버에게 메시지 알림 |
| dailyClassAutoClose (pub/sub) | 일정 기간 미모집 or 종료된 수업 recruiting=false 처리 (선택) |

---

## Geo Query Utils (반경 검색 함수 개요)

```ts
function queryClassesNear({lat, lng, radiusMeters, filters}) {
  // geofire-common으로 geohash range 계산
  // Firestore 쿼리로 후보 검색
  // 클라이언트에서 하버사인 거리 계산 후 필터 적용
  // 거리순 정렬 후 제한 개수 반환
}
```

---

## Push Notifications (FCM)

- 권한 요청 후 `users/{uid}/tokens/{token}`에 저장
- Functions에서 token 목록 순회하여 알림 전송
- Foreground handler에서 클릭 시 해당 화면 이동 (`onNotificationOpenedApp`)

---

## UX Guidelines (당근마켓 + 흑백 스타일)

- 여백 많고, 카드마다 그림자 대신 **얇은 테두리(#EAEAEA)** 사용
- Primary 버튼/강조는 **굵은 선 + 텍스트 강조** (색상 사용 X)
- 프로필/상세 사진도 **자동 흑백 필터(Optional)** 적용 가능
- Filter bar는 Sticky
- Bottom sheet 기반 지도/리스트 전환

---

## Deliverables (Codex가 생성해야 할 최종 산출물)

1. **Expo 프로젝트 전체 구조 (TypeScript)**
2. **`firebase.ts` 초기화 파일 + `.env.example`**
3. **각 화면 컴포넌트 & hooks & services**
4. **`firestore.rules` 전체**
5. **Cloud Functions 코드 (`functions/index.ts`)**
6. **README에 Setup 가이드 포함 (Firebase console 설정 / Google Maps API Key (iOS/Android) / Google Sign-In OAuth Client ID (iOS/Android/Web) 등)**

---

## Code Generation Instruction (바로 전체 코드 생성)

Now, based on the full specification above, **generate the entire Expo project code** as production-ready TypeScript modules.

**Output formatting rules (very important):**
- Use **separate code blocks per file**, with a heading that shows the **relative file path**.
- Do **not** truncate files; if a file is long, split into multiple code blocks but keep the same path in the heading.
- Use the following format for each file:

### /path/to/file.ts
```ts
// file content...
```

**Files to generate (minimum):**
1) **Project & Config**
   - `/app.json`, `/package.json`, `/tsconfig.json`, `/.gitignore`, `/.eslintrc.cjs`, `/.prettierrc`
   - `/.env.example` with all required keys (Firebase + Google Maps API Key (iOS/Android) + Google Sign-In OAuth Client ID (iOS/Android/Web) + FCM notes)
   - `/README.md` quick setup (copy essentials from this spec)
2) **Firebase**
   - `/app/services/firebase.ts` (modular SDK init; read from env)
   - `/firestore.rules` (strict, commented; aligns with schema & rules above)
3) **Navigation**
   - `/app/navigation/RootNavigator.tsx`, `/app/navigation/BottomTabs.tsx`
4) **Screens**
   - `/app/screens/Onboarding.tsx`
   - `/app/screens/Auth/SignIn.tsx`, `/app/screens/Auth/SignUp.tsx`, `/app/screens/Auth/GoogleSignInButton.tsx`
   - `/app/screens/HomeMap.tsx`, `/app/screens/NearbyList.tsx`, `/app/screens/Filters.tsx`
   - `/app/screens/ClassCreate.tsx`, `/app/screens/ClassEdit.tsx`, `/app/screens/ClassDetail.tsx`
   - `/app/screens/Requests.tsx`
   - `/app/screens/ChatList.tsx`, `/app/screens/ChatRoom.tsx`
   - `/app/screens/Profile.tsx`, `/app/screens/Settings.tsx`
5) **Components**
   - `/app/components/AppBar.tsx`, `/app/components/Card.tsx`, `/app/components/Button.tsx`, `/app/components/Chip.tsx`
   - `/app/components/FormField.tsx`, `/app/components/ImagePicker.tsx`, `/app/components/MapMarker.tsx`, `/app/components/EmptyState.tsx`
6) **Hooks**
   - `/app/hooks/useAuth.ts`, `/app/hooks/useGeoQuery.ts`, `/app/hooks/useFCM.ts`, `/app/hooks/useUploadImage.ts`
7) **State or Server State**
   - Choose **one** and implement consistently:
     - Zustand: `/app/store/index.ts`
     - **or** React Query: `/app/services/queryClient.ts`
8) **Services & Utils**
   - `/app/services/auth.ts` (email + Google Sign-In → `signInWithCredential` client flow)
   - `/app/services/firestore.ts` (typed refs & converters)
   - `/app/services/geo.ts` (geofire-common helpers)
   - `/app/services/chat.ts` (send/subscribe abstraction)
   - `/app/services/notifications.ts` (FCM register/handlers)
   - `/app/utils/format.ts`, `/app/utils/validators.ts` (zod schemas for forms/filters)
9) **Theme**
   - `/app/theme/tokens.ts` (monochrome tokens), `/app/theme/tailwind.ts` (nativewind config)
10) **Cloud Functions**
    - `/functions/package.json`, `/functions/tsconfig.json`
    - `/functions/src/index.ts` with:
      - `onEnrollRequestCreate` (notify tutor)
      - `onEnrollApproved` (notify student & ensure chat)
      - `onMessageCreate` (notify chat members)
      - `dailyClassAutoClose` (optional, pub/sub)
11) **Testing & Seeds**
    - `/app/__tests__/geo.test.ts` (distance calc & filters)
    - `/scripts/mockSeed.ts` (20 sample classes around Daechi-dong)

**Google Sign-In ↔ Firebase Auth (must implement end-to-end):**
- In app: obtain Google ID token via `@react-native-google-signin/google-signin` in `GoogleSignInButton.tsx`
- Build credential: `GoogleAuthProvider.credential(idToken)`
- Client signs in with `signInWithCredential(auth, credential)` — no Cloud Function required
- On first successful sign-in, create Firestore `users/{uid}` document if absent, then route to Profile setup

**Geo Query (must be ready-to-run):**
- Use `geofire-common` to generate/store `geohash` on class creation
- Provide `queryClassesNear({ lat, lng, radiusMeters, filters })` returning paginated nearest results

**Push Notifications (must be wired):**
- Save device tokens under `users/{uid}/tokens/{token}`
- Functions send FCM on request/approval/message events
- Foreground/background click navigates to the correct screen

**Design constraints (monochrome, Danggeun-like):**
- Strict black/white palette; emphasize with weight/spacing/borders (#EAEAEA)
- Card-first list for Nearby; sticky filter bar; bottom sheet for map/list switch

> Begin generating files now following the format described above.
