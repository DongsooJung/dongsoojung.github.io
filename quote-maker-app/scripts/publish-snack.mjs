#!/usr/bin/env node
/**
 * Expo Go용 Snack 익명 배포.
 * - snack-sdk 지원 SDK(현재 54)로 게시
 * - quote-maker-app/expo-go-deploy.json + quote-maker/expo-go-deploy.json 동기화
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Snack } = require('snack-sdk');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, '..', 'quote-maker');
const appTsx = readFileSync(join(root, 'App.tsx'), 'utf8');
const indexTs = `import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
`;

const snack = new Snack({
  name: '하루 견적서',
  description: 'Stargate Quote Maker · Expo Go Freemium PDF 견적서',
  sdkVersion: '54.0.0',
  files: {
    'App.tsx': { type: 'CODE', contents: appTsx },
    'index.js': { type: 'CODE', contents: indexTs },
  },
  dependencies: {
    'expo-status-bar': { version: '~2.2.3' },
    '@react-native-async-storage/async-storage': { version: '2.1.2' },
    'expo-print': { version: '~14.0.3' },
    'expo-sharing': { version: '~13.0.1' },
    'expo-image-picker': { version: '~16.0.6' },
  },
});

// dependency resolve 대기
await snack.getStateAsync();
const saved = await snack.saveAsync({ ignoreUser: true });

const expUrl =
  saved.url ||
  `exp://u.expo.dev/933fd9c0-1666-11e7-afca-d980795c5824?runtime-version=exposdk%3A54.0.0&channel-name=production&snack=${saved.id}`;

const info = {
  id: saved.id,
  expUrl,
  hashId: saved.hashId,
  snackId: saved.snackId,
  snackWeb: `https://snack.expo.dev/${saved.id}`,
  expoGoRedirect: `https://exp.host/--/to-exp/${encodeURIComponent(expUrl)}`,
  savedAt: new Date().toISOString(),
  sdkVersion: '54.0.0',
  note: 'Expo Go에서 Open with Expo Go / QR로 실행',
};

const outApp = join(root, 'expo-go-deploy.json');
const outWeb = join(webDir, 'expo-go-deploy.json');
writeFileSync(outApp, JSON.stringify(info, null, 2) + '\n');
mkdirSync(webDir, { recursive: true });
copyFileSync(outApp, outWeb);

// Snack 웹 페이지로 게시 검증 (멀티파일 GET API는 헤더 정책이 자주 바뀜)
const webRes = await fetch(info.snackWeb, { redirect: 'follow' });
info.verifyOk = webRes.ok;
info.verifyStatus = webRes.status;
writeFileSync(outApp, JSON.stringify(info, null, 2) + '\n');
copyFileSync(outApp, outWeb);

if (!webRes.ok) {
  console.error('Snack web verify failed', webRes.status);
  process.exit(1);
}

console.log(JSON.stringify(info, null, 2));
