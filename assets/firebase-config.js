// Web API key for Firebase project planning-with-ai-518df (project number 222755208963).
// The key supplied for this migration authenticates that project. stargate-7b399 does not
// have the Cloud Firestore API enabled, so the homepage analytics client uses this project.
export const firebaseConfig = {
  apiKey: 'AIzaSyA1amxo5j91NFmNCNIPZSx23xYNasEIMCk',
  authDomain: 'planning-with-ai-518df.firebaseapp.com',
  projectId: 'planning-with-ai-518df',
  storageBucket: 'planning-with-ai-518df.firebasestorage.app',
  messagingSenderId: '222755208963',
};

export const firebaseProjectId = firebaseConfig.projectId;

// Used only while Firestore security rules on planning-with-ai-518df deny reads and writes.
export const analyticsFallbackUrl = 'https://crudcrud.com/api/c8415085f6bd48968ab2e72e40f0c8dd';
