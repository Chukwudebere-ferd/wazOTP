const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

let initialized = false;

function initializeFirebase() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    initialized = true;
    console.log('Firebase Admin initialized');
  } catch (error) {
    console.error(`Firebase Admin initialization failed: ${error.message}`);
    throw new Error(
      `Firebase is not configured. Ensure firebase-service-account.json exists and is valid. Error: ${error.message}`
    );
  }

  return admin;
}

function isFirebaseReady() {
  return initialized || admin.apps.length > 0;
}

function getFirebaseAdmin() {
  if (!isFirebaseReady()) {
    try {
      initializeFirebase();
    } catch (error) {
      throw error;
    }
  }

  if (!isFirebaseReady()) {
    throw new Error('Firebase is not configured.');
  }

  return admin;
}

module.exports = {
  admin,
  getFirebaseAdmin,
  isFirebaseReady,
  initializeFirebase,
};
