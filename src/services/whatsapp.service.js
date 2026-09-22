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
    this.reconnectTimers = new Map();
    this.retryCounts = new Map();
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

    const disconnectReason = this.disconnectReason || {};

    const resolveName = (code) => Object.entries(disconnectReason).find(([, c]) => c === code)?.[0] || 'unknown';

    if (lastDisconnect.error instanceof Boom) {
      const statusCode = lastDisconnect.error?.output?.statusCode;
      return { statusCode: statusCode ?? null, reason: resolveName(statusCode) };
    }

    if (lastDisconnect.error?.output?.statusCode) {
      const statusCode = lastDisconnect.error.output.statusCode;
      return { statusCode, reason: resolveName(statusCode) };
    }

    // Baileys sometimes nests the code differently
    const nested = lastDisconnect.error?.data?.statusCode
      ?? lastDisconnect.statusCode
      ?? null;
    return {
      statusCode: nested,
      reason: nested !== null ? resolveName(nested) : (lastDisconnect.error?.message || 'unknown'),
    };
  }

  isFatalDisconnect(meta) {
    const DisconnectReason = this.disconnectReason || {};
    const fatalCodes = new Set([
      DisconnectReason.loggedOut,
      DisconnectReason.badSession,
      DisconnectReason.forbidden,
    ].filter((c) => c !== undefined));
    if (meta.statusCode !== null && fatalCodes.has(meta.statusCode)) {
      return true;
    }
    // Explicit logout signals from WhatsApp - never auto-retry these
    const fatalReasons = new Set(['loggedOut', 'badSession', 'forbidden']);
    return fatalReasons.has(meta.reason);
  }

  getRetryDelay(attempt) {
    const backoff = [1500, 3000, 5000, 10000, 15000, 30000];
    return backoff[Math.min(attempt, backoff.length - 1)];
  }

  clearReconnectTimer(sessionKey) {
    const timer = this.reconnectTimers.get(sessionKey);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionKey);
    }
  }

  resetRetries(sessionKey) {
    this.retryCounts.delete(sessionKey);
    this.clearReconnectTimer(sessionKey);
  }

  scheduleReconnect(userId, sessionKey, attempt = 0) {
    this.clearReconnectTimer(sessionKey);
    this.retryCounts.set(sessionKey, attempt);
    const delay = this.getRetryDelay(attempt);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(sessionKey);
      this.initSession(userId, { isReconnect: true, attempt: attempt + 1 }).catch((error) => {
        // Retry failed (DB down, version fetch failed, etc.) - keep backing off
        // instead of stranding the session in 'reconnecting' until manual Start.
        console.error(`WhatsApp reconnect attempt ${attempt + 1} failed for ${sessionKey}:`, error?.message || error);
        this.scheduleReconnect(userId, sessionKey, attempt + 1);
      });
    }, delay);
    // Don't keep the node process alive just for a retry timer
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.reconnectTimers.set(sessionKey, timer);
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
    } else {
      // Manual Start/Relink cancels any pending auto-retry so we don't double-init
      this.clearReconnectTimer(sessionKey);
      if (options.resetRetries !== false) {
        this.retryCounts.delete(sessionKey);
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
        existing.socket.end();
      } catch (error) {
        // Ignore socket shutdown errors during relink/restart.
      }
      this.sessions.delete(sessionKey);
    }

    const sessionRecord = await this.ensureSessionRecord(userId, sessionKey);
    const { state, saveCreds } = await useDbAuthState(sessionRecord.id);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (error) {
      console.error(`Baileys version fetch failed for ${sessionKey}, retrying init:`, error?.message || error);
      throw error;
    }

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
      browser: ['wazOTP', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
    });

    this.sessions.set(sessionKey, {
      socket,
      userId,
      sessionKey,
      lastOpenAt: this.sessions.get(sessionKey)?.lastOpenAt || null,
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      try {
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

          // Stable connection - stop any retry loop
          this.resetRetries(sessionKey);
          const tracked = this.getTrackedSession(sessionKey);
          if (tracked) {
            tracked.lastOpenAt = new Date();
          }

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
          const attempt = options.attempt ?? this.retryCounts.get(sessionKey) ?? 0;

          this.sessions.delete(sessionKey);

          // Only WhatsApp-side unlink (loggedOut/badSession/forbidden) stops auto-reconnect
          if (this.isFatalDisconnect(disconnectMeta)) {
            this.resetRetries(sessionKey);

            await this.updateSessionRecord(sessionKey, {
              status: 'relink_required',
              qr_payload: null,
              logout_reason: disconnectMeta.reason,
              is_active: 0,
            });

            await this.appendSessionEvent(sessionRecord.id, 'session.logged_out', disconnectMeta);
            return;
          }

          await this.updateSessionRecord(sessionKey, {
            status: 'reconnecting',
            logout_reason: disconnectMeta.reason,
            is_active: 1,
          });

          await this.appendSessionEvent(sessionRecord.id, 'session.closed', { ...disconnectMeta, attempt });

          // Persistent backoff retry - never strand in 'reconnecting'
          this.scheduleReconnect(userId, sessionKey, attempt);
        }
      } catch (error) {
        // DB hiccup inside the event handler must not kill the retry loop
        console.error(`WhatsApp connection.update handler failed for ${sessionKey}:`, error?.message || error);
        if (update?.connection === 'close') {
          const attempt = options.attempt ?? this.retryCounts.get(sessionKey) ?? 0;
          this.scheduleReconnect(userId, sessionKey, attempt);
        }
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

    // Self-heal: DB says the session should be live but there is no in-memory
    // socket (server restart, crashed socket, timed-out initializer). Kick a
    // background reconnect instead of leaving the dashboard stuck until the
    // user clicks Start Engine.
    const shouldBeLive = new Set(['connected', 'reconnecting', 'initializing', 'qr_ready']);
    if (
      shouldBeLive.has(session.status)
      && !this.getTrackedSession(sessionKey)
      && !this.initializers.has(sessionKey)
      && !this.reconnectTimers.has(sessionKey)
    ) {
      const attempt = this.retryCounts.get(sessionKey) ?? 0;
      this.scheduleReconnect(userId, sessionKey, attempt);
    }

    const fresh = await this.getSessionRecordByKey(sessionKey);
    const view = fresh || session;

    return {
      id: view.id,
      sessionKey: view.session_key,
      status: view.status,
      phoneNumber: view.phone_number,
      deviceName: view.device_name,
      logoutReason: view.logout_reason,
      lastConnectedAt: view.last_connected_at,
      lastQrAt: view.last_qr_at,
      isActive: Boolean(view.is_active),
      hasQr: Boolean(view.qr_payload),
      createdAt: view.created_at,
      updatedAt: view.updated_at,
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

    this.resetRetries(sessionKey);

    if (tracked?.socket) {
      try {
        tracked.socket.end();
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

  async resumeActiveSessions() {
    let rows = [];
    try {
      rows = await db.query(
        `SELECT user_id, session_key, status FROM whatsapp_sessions WHERE is_active = 1 AND status IN ('connected','reconnecting','initializing','qr_ready')`
      );
    } catch (error) {
      console.error('WhatsApp resume skipped (DB unavailable):', error?.message || error);
      return { resumed: 0 };
    }

    let resumed = 0;
    for (const row of rows) {
      const sessionKey = row.session_key;
      if (this.getTrackedSession(sessionKey) || this.initializers.has(sessionKey)) {
        continue;
      }
      this.scheduleReconnect(row.user_id, sessionKey, 0);
      resumed += 1;
    }
    if (resumed > 0) {
      console.log(`Resuming ${resumed} WhatsApp session(s) after startup`);
    }
    return { resumed };
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
