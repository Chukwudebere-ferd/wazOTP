const db = require('../lib/db');

class OTPService {
  async generateOTP(phone, userId) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query(
      `
        INSERT INTO otps (user_id, phone, code, expired_at)
        VALUES (?, ?, ?, ?)
      `,
      [userId, phone, code, expiredAt],
    );

    return code;
  }

  async verifyOTP(phone, otp, userId) {
    const results = await db.query(
      `
        SELECT id, code, expired_at, verified_at
        FROM otps
        WHERE phone = ? AND user_id = ? AND verified_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [phone, userId],
    );

    if (results.length === 0) {
      return false;
    }

    const record = results[0];

    if (new Date() > new Date(record.expired_at)) {
      return false;
    }

    if (record.code !== otp) {
      return false;
    }

    await db.query(
      `
        UPDATE otps
        SET verified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [record.id],
    );

    return true;
  }

  async cleanupExpiredOTPs() {
    await db.query(
      `
        DELETE FROM otps
        WHERE expired_at < CURRENT_TIMESTAMP AND verified_at IS NULL
      `,
    );
  }
}

module.exports = new OTPService();
