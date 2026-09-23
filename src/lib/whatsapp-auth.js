const pino = require('pino');
const db = require('./db');

const silentLogger = pino({ level: 'silent' });

let baileysModulePromise;

async function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }

  return baileysModulePromise;
}

/**
 * Custom Baileys authentication state that stores session data in MySQL.
 * Follows the session-management contract: creds + Signal keys are saved
 * and restored together, BufferJSON serialization, durable `set`
 * (persist-before-resolve), and a cache layer in front of key lookups.
 */
async function useDbAuthState(sessionId) {
  const { BufferJSON, initAuthCreds, makeCacheableSignalKeyStore } = await loadBaileys();

  const writeData = async (data, fileName) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await db.query(
      `
        INSERT INTO whatsapp_auth (session_id, file_name, data)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          data = VALUES(data),
          updated_at = CURRENT_TIMESTAMP
      `,
      [sessionId, fileName, serialized],
    );
  };

  // Throws on DB failure or corrupt rows (never silently returns null for
  // those). Returns null only when the row genuinely does not exist.
  const readData = async (fileName) => {
    const rows = await db.query(
      'SELECT data FROM whatsapp_auth WHERE session_id = ? AND file_name = ? LIMIT 1',
      [sessionId, fileName],
    );

    if (rows.length === 0) return null;
    return JSON.parse(rows[0].data, BufferJSON.reviver);
  };

  const removeData = async (fileName) => {
    await db.query(
      'DELETE FROM whatsapp_auth WHERE session_id = ? AND file_name = ?',
      [sessionId, fileName],
    );
  };

  let creds;
  try {
    creds = await readData('creds');
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Stored creds are corrupt and unrecoverable. Start fresh LOUDLY so the
      // user re-links, instead of failing silently on every restart.
      console.error(`[whatsapp-auth] corrupt creds for session ${sessionId}, resetting identity (re-link required)`);
      creds = null;
    } else {
      // Transient DB failure: fail init and ride the reconnect backoff. Minting
      // a throwaway identity here would get persisted over the good creds by
      // the next creds.update and permanently nuke a healthy session.
      throw error;
    }
  }
  creds = creds || initAuthCreds();

  const rawKeys = {
    get: async (type, ids) => {
      const data = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const value = await readData(`${type}-${id}`);
            // Match useMultiFileAuthState: absent keys stay absent (not null).
            if (value !== null && value !== undefined) {
              data[id] = value;
            }
          } catch (error) {
            console.error(`[whatsapp-auth] key read failed ${type}-${id}:`, error?.message || error);
          }
        }),
      );
      return data;
    },
    set: async (data) => {
      const tasks = [];
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const fileName = `${category}-${id}`;
          tasks.push(value ? writeData(value, fileName) : removeData(fileName));
        }
      }
      await Promise.all(tasks);
    },
  };

  // In-memory cache in front of per-message Signal key lookups ( Baileys docs
  // recommend this for production). Scoped to this socket instance: relink and
  // identity resets discard the whole state object, so stale entries can't leak.
  const keys = makeCacheableSignalKeyStore(rawKeys, silentLogger);

  return {
    state: {
      creds,
      keys,
    },
    saveCreds: () => writeData(creds, 'creds'),
    clearSession: async () => {
      await db.query('DELETE FROM whatsapp_auth WHERE session_id = ?', [sessionId]);
    },
  };
}

module.exports = { useDbAuthState };
