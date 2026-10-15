import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, query, where, Timestamp, deleteDoc } from 'firebase/firestore';

const emulator = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, portText] = emulator.split(':');
const rules = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'planning-with-ai-518df',
  firestore: { rules, host, port: Number(portText) },
});

const db = testEnv.unauthenticatedContext().firestore();
const createdAt = Timestamp.fromDate(new Date('2026-10-15T03:00:00Z'));
const visit = {
  visitorId: '11111111-1111-4111-8111-111111111111',
  visitDate: '2026-10-15',
  path: '/',
  createdAt,
};

await assertSucceeds(setDoc(doc(db, 'siteVisits', `${visit.visitorId}_${visit.visitDate}`), visit));
await assertSucceeds(setDoc(doc(db, 'siteVisits', `${visit.visitorId}_${visit.visitDate}`), { ...visit, path: '/research/' }));
await assertFails(setDoc(doc(db, 'siteVisits', 'bad'), { ...visit, note: 'nope' }));
await assertFails(deleteDoc(doc(db, 'siteVisits', `${visit.visitorId}_${visit.visitDate}`)));

const event = {
  visitorId: visit.visitorId,
  sessionId: '33333333-3333-4333-8333-333333333333',
  eventType: 'click',
  pagePath: '/',
  elementLabel: '전략',
  elementKind: 'link',
  targetUrl: '/strategy/',
  deviceType: 'desktop',
  day: '2026-10-15',
  createdAt,
};
await assertSucceeds(setDoc(doc(db, 'siteUsageEvents', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), event));
await assertSucceeds(setDoc(doc(db, 'siteUsageEvents', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'), {
  visitorId: visit.visitorId,
  sessionId: event.sessionId,
  eventType: 'page_view',
  pagePath: '/',
  day: '2026-10-15',
  createdAt,
}));
await assertFails(setDoc(doc(db, 'siteUsageEvents', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), event));
await assertFails(setDoc(doc(db, 'siteUsageEvents', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'), { ...event, eventType: 'scroll' }));

const visits = await getDocs(query(collection(db, 'siteVisits'), where('visitDate', '>=', '2026-10-01'), where('visitDate', '<=', '2026-10-15')));
assert.equal(visits.size, 1);
const events = await getDocs(query(collection(db, 'siteUsageEvents'), where('pagePath', '==', '/')));
assert.equal(events.size, 2);
assert.equal(events.docs[0].data().elementLabel, '전략');

await testEnv.cleanup();
console.log('firestore rules tests passed');
