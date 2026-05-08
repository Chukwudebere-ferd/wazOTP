const whatsappService = require('../services/whatsapp.service');

class WhatsAppController {
  async getSessionStatus(request, reply) {
    try {
      const session = await whatsappService.getSessionStatus(request.authUser.id);
      return { success: true, data: session };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to load WhatsApp session status',
      });
    }
  }

  async getSessionQr(request, reply) {
    try {
      const qr = await whatsappService.getSessionQr(request.authUser.id);

      return {
        success: true,
        data: qr,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to load WhatsApp session QR',
      });
    }
  }

  async connectSession(request, reply) {
    try {
      const result = await whatsappService.connectSession(request.authUser.id);
      return {
        success: true,
        message: 'WhatsApp session initialization started',
        data: {
          sessionKey: result.sessionKey,
          session: await whatsappService.getSessionStatus(request.authUser.id),
        },
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to initialize WhatsApp session',
        error: error.message,
      });
    }
  }

  async relinkSession(request, reply) {
    try {
      const result = await whatsappService.relinkSession(request.authUser.id);

      return {
        success: true,
        message: 'WhatsApp session relink started',
        data: {
          sessionKey: result.sessionKey,
          session: await whatsappService.getSessionStatus(request.authUser.id),
        },
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to relink WhatsApp session',
        error: error.message,
      });
    }
  }
}

module.exports = new WhatsAppController();
