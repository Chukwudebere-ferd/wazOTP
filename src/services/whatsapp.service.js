const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const db = require('../lib/db');

const { useDbAuthState } = require('../lib/whatsapp-auth');

let baileysModulePromise;

async function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }

  return baileysModulePromise;
}

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.initializers = new Map();
    this.baseSessionsDir = path.join(__dirname, '../../sessions');
  }

  buildSessionKey(userId) {
    return `user_${userId}_primary`;
  }

  getSessionDir(sessionKey) {
    return path.join(this.baseSessionsDir, sessionKey);
  }

  ensureSessionDir(sessionKey) {
    const sessionDir = this.getSessionDir(sessionKey);
    fs.mkdirSync(sessionDir, { recursive: true });
    return sessionDir;
  }

  getTrackedSession(sessionKey) {
    return this.sessions.get(sessionKey) || null;
  }

  async ensureSessionRecord(userId, sessionKey) {
    await db.query(
      `
        INSERT INTO whatsapp_sessions (user_id, session_key, status, is_active)
        VALUES (?, ?, 'idle', 1)
        ON DUPLICATE KEY UPDATE
          user_id = VALUES(user_id),
          updated_at = CURRENT_TIMESTAMP
      `,
      [userId, sessionKey],
    );

    return this.getSessionRecordByKey(sessionKey);
  }

  async getSessionRecordByKey(sessionKey) {
    const rows = await db.query(
      `
        SELECT id, user_id, session_key, status, phone_number, device_name, qr_payload,
               logout_reason, last_connected_at, last_qr_at, is_active, created_at, updated_at
        FROM whatsapp_sessions
        WHERE session_key = ?
        LIMIT 1
      `,
      [sessionKey],
    );

    return rows[0] || null;
  }

  async getSessionRecordByUserId(userId) {
    return this.getSessionRecordByKey(this.buildSessionKey(userId));
  }

  async updateSessionRecord(sessionKey, fields) {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return this.getSessionRecordByKey(sessionKey);
    }

    const setClauses = entries.map(([key]) => `${key} = ?`);
    const values = entries.map(([, value]) => value);
    values.push(sessionKey);

    await db.query(
      `
        UPDATE whatsapp_sessions
        SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE session_key = ?
      `,
      values,
    );

    return this.getSessionRecordByKey(sessionKey);
  }

  async appendSessionEvent(sessionId, eventType, payload = null) {
    await db.query(
      'INSERT INTO whatsapp_session_events (session_id, event_type, payload) VALUES (?, ?, ?)',
      [sessionId, eventType, payload ? JSON.stringify(payload) : null],
    );
  }

  normalizeDisconnectReason(lastDisconnect) {
    if (!lastDisconnect) {
      return { statusCode: null, reason: 'unknown' };
    }

    const disconnectReason = this.disconnectReason;

    if (lastDisconnect.error instanceof Boom) {
      const statusCode = lastDisconnect.error.output.statusCode;
      const reasonName = Object.entries(disconnectReason || {}).find(([, code]) => code === statusCode)?.[0] || 'unknown';
      return { statusCode, reason: reasonName };
    }

    if (lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode) {
      const statusCode = lastDisconnect.error.output.statusCode;
      const reasonName = Object.entries(disconnectReason || {}).find(([, code]) => code === statusCode)?.[0] || 'unknown';
      return { statusCode, reason: reasonName };
    }

    return {
      statusCode: null,
      reason: lastDisconnect.error?.message || 'unknown',
    };
  }

  async initSession(userId, options = {}) {
    const sessionKey = this.buildSessionKey(userId);
    const force = options.force === true;

    if (this.initializers.has(sessionKey)) {
      return this.initializers.get(sessionKey);
    }

    if (!force) {
      const tracked = this.getTrackedSession(sessionKey);
      if (tracked?.socket) {
        const existingRecord = await this.ensureSessionRecord(userId, sessionKey);
        return { sessionKey, session: existingRecord };
      }
    }

    const initializer = this.initializeSocket(userId, sessionKey, options)
      .finally(() => this.initializers.delete(sessionKey));

    this.initializers.set(sessionKey, initializer);
    return initializer;
  }

  async initializeSocket(userId, sessionKey, options = {}) {
    const {
      default: makeWASocket,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await loadBaileys();
    this.disconnectReason = DisconnectReason;

    const existing = this.getTrackedSession(sessionKey);
    if (existing?.socket) {
      try {
        existing.socket.end(undefined);
      } catch (error) {
        // Ignore socket shutdown errors during relink/restart.
      }
    }

    const sessionRecord = await this.ensureSessionRecord(userId, sessionKey);
    const { state, saveCreds, clearSession } = await useDbAuthState(sessionRecord.id);
    const { version } = await fetchLatestBaileysVersion();

    await this.updateSessionRecord(sessionKey, {
      status: options.isReconnect ? 'reconnecting' : 'initializing',
      logout_reason: null,
      is_active: 1,
    });

    await this.appendSessionEvent(sessionRecord.id, options.isReconnect ? 'session.reconnecting' : 'session.initializing');

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    this.sessions.set(sessionKey, {
      socket,
      userId,
      sessionKey,
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await this.updateSessionRecord(sessionKey, {
          status: 'qr_ready',
          qr_payload: qr,
          last_qr_at: new Date(),
          logout_reason: null,
          is_active: 1,
        });

        await this.appendSessionEvent(sessionRecord.id, 'session.qr_ready');
      }

      if (connection === 'open') {
        const linkedPhone = socket.user?.id ? socket.user.id.split(':')[0] : null;
        const deviceName = socket.user?.name || null;

        await this.updateSessionRecord(sessionKey, {
          status: 'connected',
          phone_number: linkedPhone,
          device_name: deviceName,
          qr_payload: null,
          logout_reason: null,
          last_connected_at: new Date(),
          is_active: 1,
        });

        await this.appendSessionEvent(sessionRecord.id, 'session.connected', {
          phoneNumber: linkedPhone,
          deviceName,
        });
      }

      if (connection === 'close') {
        const disconnectMeta = this.normalizeDisconnectReason(lastDisconnect);
        const loggedOut = disconnectMeta.statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          this.sessions.delete(sessionKey);

          await this.updateSessionRecord(sessionKey, {
            status: 'relink_required',
            qr_payload: null,
            logout_reason: disconnectMeta.reason,
            is_active: 0,
          });

          await this.appendSessionEvent(sessionRecord.id, 'session.logged_out', disconnectMeta);
          return;
        }

        this.sessions.delete(sessionKey);

        await this.updateSessionRecord(sessionKey, {
          status: 'reconnecting',
          logout_reason: disconnectMeta.reason,
          is_active: 1,
        });

        await this.appendSessionEvent(sessionRecord.id, 'session.closed', disconnectMeta);

        setTimeout(() => {
          this.initSession(userId, { isReconnect: true }).catch(() => {});
        }, 1500);
      }
    });

    return {
      sessionKey,
      session: await this.getSessionRecordByKey(sessionKey),
    };
  }

  async getSessionStatus(userId) {
    const sessionKey = this.buildSessionKey(userId);
    const session = await this.ensureSessionRecord(userId, sessionKey);

    return {
      id: session.id,
      sessionKey: session.session_key,
      status: session.status,
      phoneNumber: session.phone_number,
      deviceName: session.device_name,
      logoutReason: session.logout_reason,
      lastConnectedAt: session.last_connected_at,
      lastQrAt: session.last_qr_at,
      isActive: Boolean(session.is_active),
      hasQr: Boolean(session.qr_payload),
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  async getSessionQr(userId) {
    const session = await this.ensureSessionRecord(userId, this.buildSessionKey(userId));

    return {
      sessionKey: session.session_key,
      status: session.status,
      qr: session.qr_payload,
      generatedAt: session.last_qr_at,
    };
  }

  async relinkSession(userId) {
    const sessionKey = this.buildSessionKey(userId);
    const tracked = this.getTrackedSession(sessionKey);

    if (tracked?.socket) {
      try {
        tracked.socket.end(undefined);
      } catch (error) {
        // Ignore socket shutdown errors before session reset.
      }
    }

    this.sessions.delete(sessionKey);
    const sessionRecord = await this.getSessionRecordByKey(sessionKey);
    if (sessionRecord) {
      const { clearSession } = await useDbAuthState(sessionRecord.id);
      await clearSession();
    }

    await this.updateSessionRecord(sessionKey, {
      status: 'initializing',
      qr_payload: null,
      logout_reason: null,
      phone_number: null,
      device_name: null,
      is_active: 1,
    });

    const session = await this.getSessionRecordByKey(sessionKey);
    if (session) {
      await this.appendSessionEvent(session.id, 'session.relink_requested');
    }

    return this.initSession(userId, { force: true });
  }

  async connectSession(userId) {
    return this.initSession(userId, { force: false });
  }

  async sendMessage(userId, phone, message, eventName = 'custom_notification') {
    await loadBaileys();

    const sessionKey = this.buildSessionKey(userId);
    const tracked = this.getTrackedSession(sessionKey);
    const session = await this.ensureSessionRecord(userId, sessionKey);

    // Normalize phone number
    let recipientPhone = phone.replace(/\D/g, ''); // Remove all non-digits
    if (recipientPhone.startsWith('0') && recipientPhone.length === 11) {
      recipientPhone = `234${recipientPhone.substring(1)}`;
    }
    const logResult = async (deliveryStatus, extra = {}) => {
      await db.query(
        `
          INSERT INTO notification_logs (
            user_id, session_id, event_name, recipient_phone, message,
            delivery_status, provider_message_id, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          session?.id || null,
          eventName,
          recipientPhone,
          message,
          deliveryStatus,
          extra.providerMessageId || null,
          extra.errorMessage || null,
        ],
      );
    };

    if (!tracked?.socket || session.status !== 'connected') {
      await logResult('failed', {
        errorMessage: 'WhatsApp session is not connected. Relink or initialize the session first.',
      });

      throw new Error('WhatsApp session is not connected. Relink or initialize the session first.');
    }

    const jid = `${recipientPhone}@s.whatsapp.net`;

    try {
      const result = await tracked.socket.sendMessage(jid, { text: message });

      await logResult('sent', {
        providerMessageId: result?.key?.id || null,
      });
    } catch (error) {
      await logResult('failed', {
        errorMessage: error.message,
      });

      throw error;
    }
  }
}

module.exports = new WhatsAppService();
