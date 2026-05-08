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
    getFirebaseAdmin();
    await db.ensureSchema();
    await fastify.listen({
      port: Number(process.env.PORT || 3000),
      host: '0.0.0.0',
    });

    console.log(`wazOTP server running at http://localhost:${process.env.PORT || 3000}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
