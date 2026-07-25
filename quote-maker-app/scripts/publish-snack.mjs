#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Snack } = require('snack-sdk');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const saved = await snack.saveAsync({ ignoreUser: true });
const webUrl = saved.url.replace('exp://', 'https://');
const snackWeb = saved.id
  ? `https://snack.expo.dev/${saved.id}`
  : webUrl.includes('snack.expo.dev')
    ? webUrl
    : `https://snack.expo.dev/@snack/${saved.id || ''}`;

const info = {
  id: saved.id,
  expUrl: saved.url,
  hashId: saved.hashId,
  snackId: saved.snackId,
  snackWeb: `https://snack.expo.dev/${saved.id}`,
  savedAt: new Date().toISOString(),
  sdkVersion: '54.0.0',
  note: 'Expo Go에서 Open with Expo Go / QR로 실행',
};

writeFileSync(join(root, 'expo-go-deploy.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify(info, null, 2));
