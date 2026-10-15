import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import './site-analytics-aggregate.js';
import './site-analytics-store.js';
import { firebaseConfig, firebaseProjectId } from './firebase-config.js';

const { createAnalyticsStore } = globalThis.StargateAnalyticsStore;
const QUERY_LIMIT = 5000;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function permissionError(error) {
  const code = error?.code || '';
  const message = String(error?.message || error || '');
  if (code === 'permission-denied' || message.includes('Missing or insufficient permissions') || message.includes('PERMISSION_DENIED')) {
    const denied = new Error('Firebase 보안 규칙이 방문 통계 읽기·쓰기를 막고 있습니다.');
    denied.code = 'permission-denied';
    return denied;
  }
  return error;
}

function createFirestoreBackend(db) {
  async function readDocs(parts) {
    try {
      const snap = await getDocs(query(...parts));
      return snap.docs.map((item) => {
        const data = item.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
        };
      });
    } catch (error) {
      throw permissionError(error);
    }
  }

  return {
    async putVisit(id, data) {
      try {
        const ref = doc(db, 'siteVisits', id);
        const existing = await getDoc(ref);
        if (existing.exists()) return false;
        await setDoc(ref, {
          visitorId: data.visitorId,
          visitDate: data.visitDate,
          path: data.path,
          createdAt: Timestamp.fromDate(asDate(data.createdAt)),
        });
        return true;
      } catch (error) {
        throw permissionError(error);
      }
    },
    async putEvent(id, data) {
      try {
        const payload = {
          visitorId: data.visitorId,
          sessionId: data.sessionId,
          eventType: data.eventType,
          pagePath: data.pagePath,
          day: data.day,
          createdAt: Timestamp.fromDate(asDate(data.createdAt)),
        };
        ['pageTitle', 'elementLabel', 'elementKind', 'targetUrl', 'deviceType'].forEach((key) => {
          if (data[key]) payload[key] = data[key];
        });
        await setDoc(doc(db, 'siteUsageEvents', id), payload);
        return true;
      } catch (error) {
        throw permissionError(error);
      }
    },
    listVisits(start, end) {
      return readDocs([
        collection(db, 'siteVisits'),
        where('visitDate', '>=', start),
        where('visitDate', '<=', end),
        orderBy('visitDate'),
        limit(QUERY_LIMIT),
      ]);
    },
    async countVisits() {
      try {
        const snap = await getCountFromServer(collection(db, 'siteVisits'));
        return snap.data().count;
      } catch (error) {
        throw permissionError(error);
      }
    },
    listEvents(start, end) {
      return readDocs([
        collection(db, 'siteUsageEvents'),
        where('day', '>=', start),
        where('day', '<=', end),
        orderBy('day'),
        limit(QUERY_LIMIT),
      ]);
    },
    listPageEvents(pagePath) {
      return readDocs([
        collection(db, 'siteUsageEvents'),
        where('pagePath', '==', pagePath),
        limit(QUERY_LIMIT),
      ]);
    },
  };
}

let clientPromise;

export function loadAnalyticsClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve().then(() => {
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return createAnalyticsStore(createFirestoreBackend(getFirestore(app)));
    }).catch((error) => {
      clientPromise = null;
      throw permissionError(error);
    });
  }
  return clientPromise;
}

export { firebaseProjectId };
