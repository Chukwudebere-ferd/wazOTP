const dashboardAuth = require('../middleware/dashboard-auth');
const whatsappController = require('../controllers/whatsapp.controller');

async function whatsappRoutes(fastify) {
  fastify.addHook('preHandler', dashboardAuth);

  fastify.get('/v1/whatsapp/session/status', whatsappController.getSessionStatus);
  fastify.get('/v1/whatsapp/session/qr', whatsappController.getSessionQr);
  fastify.post('/v1/whatsapp/session/connect', whatsappController.connectSession);
  fastify.post('/v1/whatsapp/session/pair', whatsappController.pairSession);
  fastify.post('/v1/whatsapp/session/relink', whatsappController.relinkSession);
}

module.exports = whatsappRoutes;
