const otpService = require('../services/otp.service');
const whatsappService = require('../services/whatsapp.service');

class OTPController {
  async sendOTP(request, reply) {
    const { phone } = request.body;

    if (!phone) {
      return reply.status(400).send({ success: false, message: 'Phone number is required' });
    }

    try {
      // 1. Generate OTP
      const otp = await otpService.generateOTP(phone, request.userId);

      // 2. Ensure the developer's WhatsApp session is initialized
      await whatsappService.connectSession(request.userId);

      // 3. Send via WhatsApp
      const message = `Your wazOTP verification code is: ${otp}. It expires in 5 minutes.`;
      await whatsappService.sendMessage(request.userId, phone, message, 'otp_send');

      return { success: true, message: 'OTP sent' };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to send OTP', error: error.message });
    }
  }

  async verifyOTP(request, reply) {
    const { phone, otp } = request.body;

    if (!phone || !otp) {
      return reply.status(400).send({ success: false, message: 'Phone and OTP are required' });
    }

    try {
      const isValid = await otpService.verifyOTP(phone, otp, request.userId);

      if (isValid) {
        return { success: true, message: 'OTP verified' };
      } else {
        return reply.status(400).send({ success: false, message: 'Invalid or expired OTP' });
      }
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Verification failed' });
    }
  }
}

module.exports = new OTPController();
