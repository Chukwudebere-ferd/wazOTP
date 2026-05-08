const authService = require('../services/auth.service');

async function dashboardAuth(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized: Missing Firebase bearer token',
    });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();

  try {
    const decodedToken = await authService.verifyFirebaseToken(idToken);

    if (!decodedToken) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized: Invalid Firebase token',
      });
    }

    const { user } = await authService.linkFirebaseUser(
      decodedToken.uid,
      decodedToken.email || null,
    );

    request.authUser = {
      id: user.id,
      email: user.email,
      firebaseUid: decodedToken.uid,
    };
  } catch (error) {
    request.log.error(error);

    if (error.message.includes('Firebase')) {
      return reply.status(503).send({
        success: false,
        message: error.message,
      });
    }

    return reply.status(500).send({
      success: false,
      message: 'Internal server error during dashboard authentication',
    });
  }
}

module.exports = dashboardAuth;
