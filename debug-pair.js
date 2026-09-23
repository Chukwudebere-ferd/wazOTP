// Temporary pairing debugger. Run: node debug-pair.js
// 1. Start your server (npm run dev) and open the dashboard.
// 2. Run this script, then click "Get pairing code" in the dashboard.
// 3. Wait ~60s, copy ALL output and send it back. Delete this file after.
require('dotenv').config();
const db = require('./src/lib/db');

(async () => {
  try {
    const sessions = await db.query(
      'SELECT id, status FROM whatsapp_sessions ORDER BY updated_at DESC LIMIT 1',
    );
    if (!sessions.length) {
      console.log('No whatsapp_sessions rows yet. Click Start Engine first, then re-run.');
      process.exit(0);
    }
    const sessionId = sessions[0].id;
    console.log(`Watching session ${sessionId} for 60s. Click "Get pairing code" now...`);

    for (let i = 0; i < 30; i++) {
      const [row] = await db.query(
        `SELECT status, pairing_code, pairing_expires_at, logout_reason, updated_at
         FROM whatsapp_sessions WHERE id = ?`,
        [sessionId],
      );
      console.log(
        new Date().toISOString().slice(11, 19),
        `status=${row.status}`,
        `code=${row.pairing_code || '-'}`,
        `logout=${row.logout_reason || '-'}`,
      );
      await new Promise((r) => setTimeout(r, 2000));
    }

    const events = await db.query(
      `SELECT event_type, LEFT(COALESCE(payload, '-'), 200) AS payload, created_at
       FROM whatsapp_session_events WHERE session_id = ? ORDER BY id DESC LIMIT 10`,
      [sessionId],
    );
    console.log('--- EVENTS (newest first) ---');
    events.forEach((e) => console.log(`${e.created_at} ${e.event_type} ${e.payload}`));
  } catch (error) {
    console.error('DEBUG ERR:', error.message);
  }
  process.exit(0);
})();
