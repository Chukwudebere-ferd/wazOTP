const authMiddleware = require('../middleware/auth');
const messagesController = require('../controllers/messages.controller');

async function messagesRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/v1/messages/send', messagesController.sendMessage);
}

module.exports = messagesRoutes;
