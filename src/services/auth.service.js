const crypto = require('crypto');
const { query } = require('../lib/db');
const admin = require('../lib/firebase');

class AuthService {
  /**
   * Links a Firebase user to our internal DB and generates an API key
   * @param {string} firebaseUid 
   * @param {string} email 
   */
  async linkFirebaseUser(firebaseUid, email) {
    // 1. Check if user already exists
    let userResult = await query(
      'SELECT id, email FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );

    let user;
    if (userResult.rows.length === 0) {
      // 2. Create User if doesn't exist
      userResult = await query(
        'INSERT INTO users (firebase_uid, email) VALUES ($1, $2) RETURNING id, email',
        [firebaseUid, email]
      );
    }
    
    user = userResult.rows[0];

    // 3. Check if user already has an API key
    const keyResult = await query(
      'SELECT key FROM api_keys WHERE user_id = $1 AND status = $2',
      [user.id, 'active']
    );

    let apiKey;
    if (keyResult.rows.length === 0) {
      apiKey = await this.generateApiKey(user.id);
    } else {
      apiKey = keyResult.rows[0].key;
    }

    return { user, apiKey };
  }

  /**
   * Generates a new API key for a user
   * @param {number} userId 
   */
  async generateApiKey(userId) {
    const key = 'sk_live_' + crypto.randomBytes(24).toString("hex");
    
    await query(
      'INSERT INTO api_keys (user_id, key) VALUES ($1, $2)',
      [userId, key]
    );

    return key;
  }

  /**
   * Validates an API key against the database
   * @param {string} key 
   */
  async validateApiKey(key) {
    const result = await query(
      'SELECT user_id FROM api_keys WHERE key = $1 AND status = $2',
      [key, 'active']
    );

    return result.rows[0] ? result.rows[0].user_id : null;
  }

  /**
   * Verifies a Firebase ID Token (for Dashboard use)
   * @param {string} idToken 
   */
  async verifyFirebaseToken(idToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      return null;
    }
  }
}

module.exports = new AuthService();
