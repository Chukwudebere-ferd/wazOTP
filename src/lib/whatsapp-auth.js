const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');
const db = require('./db');

/**
 * Custom Baileys authentication state that stores session data in MySQL.
 */
async function useDbAuthState(sessionId) {
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

  const readData = async (fileName) => {
    try {
      const rows = await db.query(
        'SELECT data FROM whatsapp_auth WHERE session_id = ? AND file_name = ? LIMIT 1',
        [sessionId, fileName],
      );

      if (rows.length === 0) return null;
      return JSON.parse(rows[0].data, BufferJSON.reviver);
    } catch (error) {
      return null;
    }
  };

  const removeData = async (fileName) => {
    try {
      await db.query(
        'DELETE FROM whatsapp_auth WHERE session_id = ? AND file_name = ?',
        [sessionId, fileName],
      );
    } catch (error) {
      // Ignore delete errors
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                // Ensure correct structure if needed
              }
              data[id] = value;
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
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
    clearSession: async () => {
      await db.query('DELETE FROM whatsapp_auth WHERE session_id = ?', [sessionId]);
    },
  };
}

module.exports = { useDbAuthState };
