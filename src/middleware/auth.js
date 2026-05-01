const authService = require('../services/auth.service');

/**
 * Authentication Middleware
 * Validates the API key against the PostgreSQL database.
 */
const authMiddleware = async (request, reply) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized: Missing or invalid API key'
    });
  }

  const apiKey = authHeader.split(' ')[1];

  try {
    const userId = await authService.validateApiKey(apiKey);

    if (!userId) {
      return reply.status(403).send({
        success: false,
        message: 'Forbidden: Invalid or inactive API key'
      });
    }

    // Attach the user ID to the request for use in controllers
    // For WhatsApp sessions, we can use the userId as the sessionId
    request.developerId = `dev_${userId}`;
    request.userId = userId;
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

module.exports = authMiddleware;
