const authController = require('../controllers/auth.controller');

async function authRoutes(fastify, options) {
  // Use this endpoint to sync your Firebase User with the backend
  fastify.post('/v1/auth/sync', authController.syncUser);
}

module.exports = authRoutes;
