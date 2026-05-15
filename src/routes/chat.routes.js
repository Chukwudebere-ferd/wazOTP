const chatController = require('../controllers/chat.controller');

async function chatRoutes(fastify, options) {
  // We won't require authMiddleware for this so the docs page can access it without a user session
  fastify.post('/v1/chat', chatController.handleChat);
}

module.exports = chatRoutes;
