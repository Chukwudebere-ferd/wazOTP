require('dotenv').config();

const db = require('./lib/db');
const { getFirebaseAdmin } = require('./lib/firebase');

const fastify = require('fastify')({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

fastify.register(require('./routes/auth.routes'));
fastify.register(require('./routes/otp.routes'));
fastify.register(require('./routes/messages.routes'));
fastify.register(require('./routes/whatsapp.routes'));
fastify.register(require('./routes/dashboard.routes'));
fastify.register(require('./routes/docs.routes'));

fastify.get('/', async () => ({
  name: 'wazOTP API',
  version: '1.0.0',
  status: 'running',
}));

const start = async () => {
  try {
    console.log('🚀 Starting wazOTP production server...');
    
    console.log('📦 Initializing Firebase...');
    getFirebaseAdmin();
    
    console.log('🗄️ Checking Database schema...');
    await db.ensureSchema();
    
    const port = Number(process.env.PORT || 3000);
    const host = '0.0.0.0';

    await fastify.listen({ port, host });

    console.log(`✅ wazOTP server is live at http://${host}:${port}`);
  } catch (err) {
    console.error('❌ CRITICAL STARTUP ERROR:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
};

start();
