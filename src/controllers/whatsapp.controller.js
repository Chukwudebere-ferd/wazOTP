const whatsappService = require('../services/whatsapp.service');
const db = require('../lib/db');

class WhatsAppController {
  async getSessionStatus(request, reply) {
    try {
      const session = await whatsappService.getSessionStatus(request.authUser.id);
      return { success: true, data: session };
    } catch (error) {
      request.log.error(error);

      if (db.isDbConnectionError(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Database is currently unavailable',
        });
      }

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

      if (db.isDbConnectionError(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Database is currently unavailable',
        });
      }

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

      if (db.isDbConnectionError(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Database is currently unavailable',
        });
      }

      return reply.status(500).send({
        success: false,
        message: 'Failed to initialize WhatsApp session',
        error: error.message,
      });
    }
  }

  async pairSession(request, reply) {
    try {
      const { phone } = request.body || {};

      if (!phone) {
        return reply.status(400).send({
          success: false,
          message: 'Phone number is required (international format, e.g. 2348012345678).',
        });
      }

      const result = await whatsappService.requestPairingCode(request.authUser.id, phone);

      return {
        success: true,
        message: 'Pairing code ready. Enter it in WhatsApp > Linked devices > Link with phone number.',
        data: {
          sessionKey: result.sessionKey,
          pairingCode: result.pairingCode,
          phoneNumber: result.phoneNumber,
          expiresAt: result.expiresAt,
          session: await whatsappService.getSessionStatus(request.authUser.id),
        },
      };
    } catch (error) {
      request.log.error(error);

      if (db.isDbConnectionError(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Database is currently unavailable',
        });
      }

      const clientErrors = ['required', 'Invalid phone', 'already connected', 'already linked', 'starting', 'Pairing rejected', 'not ready yet', 'Get code again', 'Relink', 'not registered on WhatsApp', 'fresh start'];
      if (clientErrors.some((fragment) => error.message.includes(fragment))) {
        return reply.status(400).send({
          success: false,
          message: error.message,
        });
      }

      return reply.status(500).send({
        success: false,
        message: 'Failed to request pairing code',
        error: error.message,
      });
    }
  }

  async relinkSession(request, reply) {    try {
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

      if (db.isDbConnectionError(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Database is currently unavailable',
        });
      }

      return reply.status(500).send({
        success: false,
        message: 'Failed to relink WhatsApp session',
        error: error.message,
      });
    }
  }
}

module.exports = new WhatsAppController();
