const crypto = require('crypto');
const {
  getFirebaseAdmin,
  isFirebaseReady,
} = require('../lib/firebase');
const db = require('../lib/db');

class AuthService {
  /**
   * Links a Firebase-authenticated user to the SQL database and generates an API key
   */
  async linkFirebaseUser(firebaseUid, email) {
    await db.query(
      `
        INSERT INTO users (firebase_uid, email)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          updated_at = CURRENT_TIMESTAMP
      `,
      [firebaseUid, email || null],
    );

    const users = await db.query(
      'SELECT id, email, firebase_uid FROM users WHERE firebase_uid = ? LIMIT 1',
      [firebaseUid],
    );

    if (users.length === 0) {
      throw new Error('Failed to load SQL user after sync.');
    }

    const user = users[0];
    const activeKeys = await db.query(
      `
        SELECT \`key\`
        FROM api_keys
        WHERE user_id = ? AND status = 'active'
        ORDER BY id ASC
        LIMIT 1
      `,
      [user.id],
    );

    const apiKey = activeKeys.length > 0
      ? activeKeys[0].key
      : await this.generateApiKey(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      apiKey,
    };
  }

  /**
   * Generates a new API key for a user
   */
  async generateApiKey(userId) {
    const key = 'sk_live_' + crypto.randomBytes(24).toString('hex');

    await db.query(
      'INSERT INTO api_keys (user_id, `key`, status) VALUES (?, ?, ?)',
      [userId, key, 'active'],
    );

    return key;
  }

  /**
   * Validates an API key against MySQL
   */
  async validateApiKey(key) {
    const rows = await db.query(
      `
        SELECT user_id
        FROM api_keys
        WHERE \`key\` = ? AND status = 'active'
        LIMIT 1
      `,
      [key],
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].user_id;
  }

  async getUserById(userId) {
    const rows = await db.query(
      `
        SELECT id, email, firebase_uid
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    return rows[0] || null;
  }

  async getActiveApiKeyForUser(userId) {
    const rows = await db.query(
      `
        SELECT \`key\`, created_at, updated_at
        FROM api_keys
        WHERE user_id = ? AND status = 'active'
        ORDER BY id ASC
        LIMIT 1
      `,
      [userId],
    );

    return rows[0] || null;
  }

  /**
   * Verifies a Firebase ID Token
   */
  async verifyFirebaseToken(idToken) {
    if (!isFirebaseReady()) {
      throw new Error('Firebase authentication is currently unavailable.');
    }

    try {
      const decodedToken = await getFirebaseAdmin().auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Firebase token verification failed:', error.message);
      return null;
    }
  }
}

module.exports = new AuthService();
