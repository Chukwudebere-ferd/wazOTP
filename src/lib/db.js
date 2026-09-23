const mysql = require('mysql2/promise');

let pool;
let schemaReady = false;
let lastSchemaError = null;

function getDbConfig() {
  const enableSsl = String(
    process.env.DB_ENABLE_SSL
      || process.env.DATABASE_ENABLE_SSL
      || '',
  ).toLowerCase() === 'true';

  return {
    host: process.env.DB_HOST || process.env.DATABASE_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || process.env.DB_USERNAME || process.env.DATABASE_USER,
    password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD,
    database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    ssl: enableSsl
      ? {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
        }
      : undefined,
  };
}

function validateDbConfig() {
  const resolvedConfig = getDbConfig();
  const requiredVars = [
    ['DB_HOST', resolvedConfig.host],
    ['DB_USER', resolvedConfig.user],
    ['DB_PASSWORD', resolvedConfig.password],
    ['DB_NAME', resolvedConfig.database],
  ];
  const missingVars = requiredVars.filter(([, value]) => !value).map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(`Missing required database environment variables: ${missingVars.join(', ')}`);
  }
}

function getPool() {
  if (pool) {
    return pool;
  }

  validateDbConfig();
  pool = mysql.createPool(getDbConfig());
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function ensureSchema() {
  const connection = await getPool().getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        firebase_uid VARCHAR(191) NOT NULL,
        email VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_firebase_uid (firebase_uid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        \`key\` VARCHAR(191) NOT NULL,
        status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_api_keys_key (\`key\`),
        KEY idx_api_keys_user_status (user_id, status),
        CONSTRAINT fk_api_keys_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        session_key VARCHAR(191) NOT NULL,
        status ENUM('idle', 'initializing', 'qr_ready', 'pairing_ready', 'connected', 'reconnecting', 'relink_required', 'failed') NOT NULL DEFAULT 'idle',
        phone_number VARCHAR(32) NULL,
        device_name VARCHAR(191) NULL,
        qr_payload LONGTEXT NULL,
        pairing_code VARCHAR(16) NULL,
        pairing_expires_at TIMESTAMP NULL DEFAULT NULL,
        logout_reason VARCHAR(191) NULL,
        last_connected_at TIMESTAMP NULL DEFAULT NULL,
        last_qr_at TIMESTAMP NULL DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_whatsapp_sessions_session_key (session_key),
        KEY idx_whatsapp_sessions_user_id (user_id),
        CONSTRAINT fk_whatsapp_sessions_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Safe migration for existing installs (no rebuild, no data loss)
    const [pairingCol] = await connection.query(
      "SHOW COLUMNS FROM whatsapp_sessions LIKE 'pairing_code'",
    );
    if (pairingCol.length === 0) {
      await connection.query(
        'ALTER TABLE whatsapp_sessions ADD COLUMN pairing_code VARCHAR(16) NULL AFTER qr_payload',
      );
    }

    const [pairingExpCol] = await connection.query(
      "SHOW COLUMNS FROM whatsapp_sessions LIKE 'pairing_expires_at'",
    );
    if (pairingExpCol.length === 0) {
      await connection.query(
        'ALTER TABLE whatsapp_sessions ADD COLUMN pairing_expires_at TIMESTAMP NULL DEFAULT NULL AFTER pairing_code',
      );
    }

    const [statusCol] = await connection.query(
      "SHOW COLUMNS FROM whatsapp_sessions LIKE 'status'",
    );
    const statusType = statusCol[0]?.Type || '';
    if (!statusType.includes('pairing_ready')) {
      await connection.query(
        `ALTER TABLE whatsapp_sessions MODIFY COLUMN status ENUM('idle', 'initializing', 'qr_ready', 'pairing_ready', 'connected', 'reconnecting', 'relink_required', 'failed') NOT NULL DEFAULT 'idle'`,
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_session_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_id BIGINT UNSIGNED NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_whatsapp_session_events_session_id (session_id),
        CONSTRAINT fk_whatsapp_session_events_session
          FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        session_id BIGINT UNSIGNED NULL,
        event_name VARCHAR(100) NOT NULL,
        recipient_phone VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        delivery_status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
        provider_message_id VARCHAR(191) NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_notification_logs_user_id (user_id),
        KEY idx_notification_logs_session_id (session_id),
        CONSTRAINT fk_notification_logs_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_notification_logs_session
          FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        phone VARCHAR(32) NOT NULL,
        code VARCHAR(6) NOT NULL,
        verified_at TIMESTAMP NULL,
        expired_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_otps_phone_expired (phone, expired_at),
        KEY idx_otps_user_id (user_id),
        CONSTRAINT fk_otps_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_auth (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_id BIGINT UNSIGNED NOT NULL,
        file_name VARCHAR(191) NOT NULL,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_whatsapp_auth_session_file (session_id, file_name),
        CONSTRAINT fk_whatsapp_auth_session
          FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    schemaReady = true;
    lastSchemaError = null;
  } finally {
    connection.release();
  }
}

function markSchemaUnavailable(error) {
  schemaReady = false;
  lastSchemaError = error || null;
}

function getDbStatus() {
  return {
    ready: schemaReady,
    error: lastSchemaError ? lastSchemaError.message : null,
  };
}

function isDbConnectionError(error) {
  if (!error) {
    return false;
  }

  const transientCodes = new Set([
    'EACCES',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
  ]);

  return transientCodes.has(error.code);
}

module.exports = {
  ensureSchema,
  getDbStatus,
  getPool,
  isDbConnectionError,
  markSchemaUnavailable,
  query,
};
