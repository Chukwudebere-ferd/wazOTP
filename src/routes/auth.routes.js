const authController = require('../controllers/auth.controller');
const dashboardAuth = require('../middleware/dashboard-auth');

async function authRoutes(fastify, options) {
  // Use this endpoint to sync your Firebase User with the backend
  fastify.post('/v1/auth/sync', authController.syncUser);
  fastify.get('/v1/auth/me', { preHandler: dashboardAuth }, authController.getCurrentDeveloper);
}

module.exports = authRoutes;
