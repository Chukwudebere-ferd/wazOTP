const otpController = require('../controllers/otp.controller');
const authMiddleware = require('../middleware/auth');

async function otpRoutes(fastify, options) {
  // All OTP routes require API Key authentication
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/v1/otp/send', otpController.sendOTP);
  fastify.post('/v1/otp/verify', otpController.verifyOTP);
  fastify.post('/v1/otp/retrieve', otpController.retrieveOTPs);
}

module.exports = otpRoutes;
