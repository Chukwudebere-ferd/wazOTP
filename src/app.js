process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

console.log('🏁 APP FILE LOADED');
console.log('🐢 NODE VERSION:', process.version);

require('dotenv').config();

const db = require('./lib/db');
const { getFirebaseAdmin } = require('./lib/firebase');

const fastify = require('fastify')({
  logger: true // Simplified logger for Alpine compatibility
});

// Log every request to debug the Health Check
fastify.addHook('onRequest', async (request) => {
  console.log(`📥 Incoming ${request.method} request to ${request.url}`);
});

fastify.register(require('./routes/auth.routes'));
fastify.register(require('./routes/otp.routes'));
fastify.register(require('./routes/messages.routes'));
fastify.register(require('./routes/whatsapp.routes'));
fastify.register(require('./routes/dashboard.routes'));
fastify.register(require('./routes/docs.routes'));
fastify.register(require('./routes/chat.routes'));

fastify.get('/', async () => ({
  name: 'wazOTP API',
  version: '1.0.0',
  status: 'running',
}));

fastify.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    const port = Number(process.env.PORT || 3000);
    const host = '0.0.0.0';

    console.log(`🌍 Environment: Port=${port}, Node_Env=${process.env.NODE_ENV}`);
    console.log('🚀 ABOUT TO START FASTIFY');

    // 1. Start listening IMMEDIATELY so health checks pass
    await fastify.listen({ port, host });
    console.log('✅ FASTIFY STARTED');
    console.log(`📡 Server listening on port ${port}`);

    // 2. Perform background initializations
    console.log('📦 Initializing Firebase...');
    getFirebaseAdmin();
    
    console.log('🗄️ Checking Database schema...');
    await db.ensureSchema();
    
    console.log('✅ All systems ready. wazOTP is live!');
  } catch (err) {
    console.error('❌ CRITICAL STARTUP ERROR:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
};

start();
