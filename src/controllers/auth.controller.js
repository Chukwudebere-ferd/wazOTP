const authService = require('../services/auth.service');
const whatsappService = require('../services/whatsapp.service');

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

      if (error.message.includes('Firebase')) {
        return reply.status(503).send({
          success: false,
          message: error.message
        });
      }

      return reply.status(500).send({ 
        success: false, 
        message: 'Sync failed' 
      });
    }
  }

  async getCurrentDeveloper(request, reply) {
    try {
      const user = await authService.getUserById(request.authUser.id);
      const apiKey = await authService.getActiveApiKeyForUser(request.authUser.id);
      const session = await whatsappService.getSessionStatus(request.authUser.id);

      return {
        success: true,
        data: {
          user: {
            id: user?.id || request.authUser.id,
            email: user?.email || request.authUser.email,
            firebaseUid: user?.firebase_uid || request.authUser.firebaseUid,
          },
          apiKey: apiKey?.key || null,
          session,
        },
      };
    } catch (error) {
      request.log.error(error);

      return reply.status(500).send({
        success: false,
        message: 'Failed to load developer summary',
      });
    }
  }
}

module.exports = new AuthController();
