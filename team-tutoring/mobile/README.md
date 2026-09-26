# Gangnam Tutoring — Mobile

강남 그룹 과외 위치기반 앱의 React Native (Expo) 최소 골격.
전체 스펙은 [`../docs/PROMPT_GROUP_TUTORING_APP.md`](../docs/PROMPT_GROUP_TUTORING_APP.md) 참조.

## Setup

```bash
cd mobile
cp .env.example .env    # fill in values
npm install
npx expo start
```

## Required credentials

| Key | Where to get it |
|-----|-----------------|
| `FIREBASE_*` | Firebase console → Project settings → General → Your apps |
| `GOOGLE_MAPS_API_KEY_IOS` / `_ANDROID` | Google Cloud Console → APIs & Services → Credentials (Maps SDK for iOS/Android enabled) |
| `GOOGLE_SIGNIN_WEB_CLIENT_ID` | Google Cloud Console → OAuth 2.0 Client IDs → Web application |
| `GOOGLE_SIGNIN_IOS_URL_SCHEME` | Reversed iOS OAuth client ID (e.g. `com.googleusercontent.apps.XXXX`) |

## Current status

This is a **minimal runnable skeleton** — screens are stubs. Wire up the flows described in the spec incrementally:

1. Firebase Auth via `signInWithCredential(GoogleAuthProvider.credential(idToken))`
2. Firestore `classes` collection with `geohash` (see `geofire-common`)
3. `react-native-maps` `PROVIDER_GOOGLE` centered on Daechi-dong
4. FCM push notifications for enroll requests / approvals / messages
