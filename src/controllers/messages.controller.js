const whatsappService = require('../services/whatsapp.service');

class MessagesController {
  async sendMessage(request, reply) {
    const { to, message, event } = request.body || {};

    if (!to || !message) {
      return reply.status(400).send({
        success: false,
        message: '`to` and `message` are required',
      });
    }

    try {
      await whatsappService.sendMessage(
        request.userId,
        to,
        message,
        event || 'custom_message',
      );

      return {
        success: true,
        message: 'Message sent',
        data: {
          to,
          event: event || 'custom_message',
        },
      };
    } catch (error) {
      request.log.error(error);

      return reply.status(500).send({
        success: false,
        message: 'Failed to send message',
        error: error.message,
      });
    }
  }
}

module.exports = new MessagesController();
