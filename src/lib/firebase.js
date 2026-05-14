const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

let initialized = false;

function initializeFirebase() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      // Decode base64 environment variable
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
      credential = admin.credential.cert(JSON.parse(decoded));
      console.log('Firebase Admin initialized from Base64 Environment Variable');
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // Use individual environment variables
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      console.log('Firebase Admin initialized from Individual Environment Variables');
    } else if (fs.existsSync(serviceAccountPath)) {
      // Fallback to local file for development
      const serviceAccount = require(serviceAccountPath);
      credential = admin.credential.cert(serviceAccount);
      console.log('Firebase Admin initialized from local file');
    } else {
      throw new Error('Firebase credentials not found. Provide FIREBASE_SERVICE_ACCOUNT_BASE64, or individual FIREBASE_* env vars, or the local JSON file.');
    }

    admin.initializeApp({
      credential,
    });

    initialized = true;
  } catch (error) {
    console.error(`Firebase Admin initialization failed: ${error.message}`);
    throw new Error(
      `Firebase is not configured correctly. Error: ${error.message}`
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
