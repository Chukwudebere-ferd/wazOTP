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
  console.warn('⚠️ Firebase Admin could not be initialized:', error.message);
}

module.exports = admin;
