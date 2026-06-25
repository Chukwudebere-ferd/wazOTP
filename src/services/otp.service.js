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

  async retrieveOTPs(userId, filters = {}, fields = null, pagination = {}, sort = {}) {
    const allowedFields = {
      id: 'o.id',
      phone: 'o.phone',
      code: 'o.code',
      verified_at: 'o.verified_at',
      expired_at: 'o.expired_at',
      created_at: 'o.created_at',
    };

    const statusExpr = `
      CASE
        WHEN o.verified_at IS NOT NULL THEN 'verified'
        WHEN o.expired_at < CURRENT_TIMESTAMP THEN 'expired'
        ELSE 'pending'
      END
    `;

    let selectedColumns;
    if (fields && Array.isArray(fields) && fields.length > 0) {
      selectedColumns = fields
        .filter(f => f === 'status' || allowedFields[f])
        .map(f => f === 'status' ? `${statusExpr} AS status` : allowedFields[f]);
    } else {
      selectedColumns = [
        'o.id',
        'o.phone',
        `${statusExpr} AS status`,
        'o.created_at',
        'o.expired_at',
        'o.verified_at',
      ];
    }

    const selectClause = selectedColumns.join(', ');
    const conditions = ['o.user_id = ?'];
    const params = [userId];

    if (filters.phone) {
      conditions.push('o.phone = ?');
      params.push(filters.phone);
    }

    if (filters.status && filters.status !== 'all') {
      switch (filters.status) {
        case 'verified':
          conditions.push('o.verified_at IS NOT NULL');
          break;
        case 'unverified':
          conditions.push('o.verified_at IS NULL');
          break;
        case 'expired':
          conditions.push('o.expired_at < CURRENT_TIMESTAMP');
          break;
        case 'pending':
          conditions.push('o.verified_at IS NULL AND o.expired_at >= CURRENT_TIMESTAMP');
          break;
      }
    }

    if (filters.date_from) {
      conditions.push('o.created_at >= ?');
      params.push(new Date(filters.date_from));
    }

    if (filters.date_to) {
      conditions.push('o.created_at <= ?');
      params.push(new Date(filters.date_to));
    }

    if (filters.expired === true) {
      conditions.push('o.expired_at < CURRENT_TIMESTAMP');
    } else if (filters.expired === false) {
      conditions.push('o.expired_at >= CURRENT_TIMESTAMP');
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM otps o WHERE ${whereClause}`,
      params,
    );
    const total = countResult[0].total;

    const allowedSortBy = ['id', 'phone', 'created_at', 'expired_at', 'verified_at'];
    const sortBy = sort.by && allowedSortBy.includes(sort.by) ? sort.by : 'created_at';
    const sortOrder = sort.order && sort.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const page = Math.max(1, parseInt(pagination.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const rows = await db.query(
      `SELECT ${selectClause} FROM otps o WHERE ${whereClause} ORDER BY o.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
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
