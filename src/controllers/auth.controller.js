const authService = require('../services/auth.service');

class AuthController {
  /**
   * Syncs a Firebase user with our backend
   * Expects a Firebase ID Token in the body
   */
  async syncUser(request, reply) {
    const { idToken } = request.body;

    if (!idToken) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Firebase idToken is required' 
      });
    }

    try {
      // 1. Verify the token with Firebase
      const decodedToken = await authService.verifyFirebaseToken(idToken);
      
      if (!decodedToken) {
        return reply.status(401).send({ 
          success: false, 
          message: 'Invalid Firebase token' 
        });
      }

      const { uid, email } = decodedToken;

      // 2. Link/Create user in our DB and get/generate API key
      const { user, apiKey } = await authService.linkFirebaseUser(uid, email);

      return {
        success: true,
        message: 'User synced successfully',
        data: {
          user: { id: user.id, email: user.email, firebaseUid: uid },
          apiKey: apiKey
        }
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ 
        success: false, 
        message: 'Sync failed' 
      });
    }
  }
}

module.exports = new AuthController();
