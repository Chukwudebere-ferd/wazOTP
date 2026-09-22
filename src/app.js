process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

console.log('APP FILE LOADED');
console.log('NODE VERSION:', process.version);

require('dotenv').config();

const Fastify = require('fastify');
const db = require('./lib/db');
const { getFirebaseAdmin, isFirebaseReady } = require('./lib/firebase');

let appInstance;
let dependenciesInitPromise;

function createApp() {
  const fastify = Fastify({
    logger: true,
  });

  fastify.addHook('onRequest', async (request) => {
    console.log(`Incoming ${request.method} request to ${request.url}`);
  });

  fastify.register(require('./routes/auth.routes'));
  fastify.register(require('./routes/otp.routes'));
  fastify.register(require('./routes/messages.routes'));
  fastify.register(require('./routes/whatsapp.routes'));
  fastify.register(require('./routes/dashboard.routes'));
  fastify.register(require('./routes/docs.routes'));
  fastify.register(require('./routes/chat.routes'));

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (db.isDbConnectionError(error)) {
      return reply.status(503).send({
        success: false,
        message: 'Database is currently unavailable',
      });
    }

    return reply.status(error.statusCode || 500).send({
      success: false,
      message: error.message || 'Internal server error',
    });
  });

  fastify.get('/', async (_, reply) => reply.redirect('/dashboard'));

  fastify.get('/health', async () => ({
    status: 'ok',
    dependencies: {
      firebase: isFirebaseReady(),
      database: db.getDbStatus(),
    },
  }));

  return fastify;
}

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }

  return appInstance;
}

async function initializeDependencies() {
  if (dependenciesInitPromise) {
    return dependenciesInitPromise;
  }

  dependenciesInitPromise = (async () => {
    try {
      console.log('Initializing Firebase...');
      getFirebaseAdmin();
    } catch (error) {
      console.error(`Firebase initialization degraded: ${error.message}`);
    }

    try {
      console.log('Checking Database schema...');
      await db.ensureSchema();
      console.log('Database schema ready');
    } catch (error) {
      db.markSchemaUnavailable(error);
      console.error(`Database initialization degraded: ${error.message}`);
    }

    console.log('Startup initialization finished');
  })();

  return dependenciesInitPromise;
}

async function prepareApp() {
  const app = getApp();
  await app.ready();
  void initializeDependencies();
  return app;
}

async function start() {
  try {
    const app = getApp();
    const port = Number(process.env.PORT || 3000);
    const host = '0.0.0.0';

    console.log(`Environment: Port=${port}, Node_Env=${process.env.NODE_ENV}`);
    console.log('ABOUT TO START FASTIFY');

    await app.listen({ port, host });
    console.log('FASTIFY STARTED');
    console.log(`Server listening on port ${port}`);

    void initializeDependencies();

    console.log('wazOTP is live');
  } catch (err) {
    console.error('CRITICAL STARTUP ERROR:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

module.exports = {
  createApp,
  getApp,
  initializeDependencies,
  prepareApp,
  start,
};

if (require.main === module) {
  start();
}
