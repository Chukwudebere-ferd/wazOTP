const crypto = require('crypto');
const admin = require('../lib/firebase');

class AuthService {
  constructor() {
    this.db = admin.firestore();
    this.usersColl = this.db.collection('users');
    this.apiKeysColl = this.db.collection('api_keys');
  }

  /**
   * Links a Firebase user to our Firestore DB and generates an API key
   */
  async linkFirebaseUser(firebaseUid, email) {
    // 1. Check if user already exists
    const userSnapshot = await this.usersColl.where('firebase_uid', '==', firebaseUid).limit(1).get();
    
    let userDoc;
    if (userSnapshot.empty) {
      // 2. Create User if doesn't exist
      userDoc = await this.usersColl.add({
        firebase_uid: firebaseUid,
        email: email,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      userDoc = userSnapshot.docs[0].ref;
    }

    const userId = userDoc.id;

    // 3. Check if user already has an active API key
    const keySnapshot = await this.apiKeysColl
      .where('user_id', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    let apiKey;
    if (keySnapshot.empty) {
      apiKey = await this.generateApiKey(userId);
    } else {
      apiKey = keySnapshot.docs[0].data().key;
    }

    return { user: { id: userId, email }, apiKey };
  }

  /**
   * Generates a new API key for a user
   */
  async generateApiKey(userId) {
    const key = 'sk_live_' + crypto.randomBytes(24).toString("hex");
    
    await this.apiKeysColl.add({
      user_id: userId,
      key: key,
      status: 'active',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return key;
  }

  /**
   * Validates an API key against Firestore
   */
  async validateApiKey(key) {
    const snapshot = await this.apiKeysColl
      .where('key', '==', key)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data().user_id;
  }

  /**
   * Verifies a Firebase ID Token
   */
  async verifyFirebaseToken(idToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Firebase token verification failed:', error.message);
      return null;
    }
  }
}

module.exports = new AuthService();
