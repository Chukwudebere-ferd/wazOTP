require('dotenv').config();
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

// Register Routes
fastify.register(require('./routes/auth.routes'));
fastify.register(require('./routes/otp.routes'));

// Health Check / Welcome
fastify.get('/', async () => {
  return { 
    name: 'wazOTP API', 
    version: '1.0.0', 
    status: 'running' 
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    console.log(`🚀 wazOTP server running at http://localhost:${process.env.PORT || 3000}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
