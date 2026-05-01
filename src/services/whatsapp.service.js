const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Initializes a WhatsApp session for a specific user
   * @param {string} sessionId - Unique identifier for the user/developer
   */
  async initSession(sessionId) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);

    const sessionDir = path.join(__dirname, '../../sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true, // Useful for dev
      logger: require('pino')({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📡 QR Code generated for session ${sessionId}. Please scan it.`);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut 
          : true;
        
        console.log(`❌ Connection closed for ${sessionId}. Reconnecting: ${shouldReconnect}`);
        if (shouldReconnect) this.initSession(sessionId);
      } else if (connection === 'open') {
        console.log(`✅ WhatsApp Connected for session ${sessionId}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    this.sessions.set(sessionId, sock);
    return sock;
  }

  /**
   * Sends a message via a specific session
   * @param {string} sessionId 
   * @param {string} phone - Target phone number (with country code)
   * @param {string} message 
   */
  async sendMessage(sessionId, phone, message) {
    const sock = this.sessions.get(sessionId);
    if (!sock) throw new Error(`Session ${sessionId} not initialized`);

    const jid = `${phone.replace('+', '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
  }
}

module.exports = new WhatsAppService();
