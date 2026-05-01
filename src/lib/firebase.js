const admin = require('firebase-admin');
const path = require('path');

// Path to your service account key file
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
  console.log('🔥 Firebase Admin initialized');
} catch (error) {
  console.warn('⚠️ Firebase Admin could not be initialized. Please ensure firebase-service-account.json exists.');
  // We don't exit the process here so the server can still run in "dev" mode if needed
}

module.exports = admin;
