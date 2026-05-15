class ChatController {
  async handleChat(request, reply) {
    const { message } = request.body;

    if (!message) {
      return reply.status(400).send({ error: 'Message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return reply.status(500).send({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const systemPrompt = `You are the official AI Technical Support Assistant for wazOTP.
wazOTP is an Enterprise WhatsApp Gateway and API platform. It allows developers to send WhatsApp messages and implement 2FA/OTPs programmatically.

## Core Identity & Project Information
1. No SDK Required: Developers do NOT need to install \`@whiskeysockets/baileys\`, Puppeteer, or any other WhatsApp SDKs. wazOTP abstracts all of that into a clean REST API. Developers only need to make HTTP requests (cURL, fetch, axios, etc.).
2. High Speed: Messages are dispatched in under 2 seconds via our internal Baileys engine.
3. Phone Formatting: All phone numbers MUST use the E.164 standard (e.g., +2348031234567). Our system auto-converts local Nigerian numbers (starting with 0) to international format.
4. Authentication: All API calls require an API Key passed in the headers as \`Authorization: Bearer sk_live_YOUR_API_KEY\`.
5. Base URL: The current base URL is \`https://wazotp.pxxl.pro\`. All endpoints are prefixed with this (e.g., \`https://wazotp.pxxl.pro/v1/otp/send\`).

## OTP Lifecycle (Crucial)
1. Generation: The developer DOES NOT generate or pass the OTP. wazOTP generates a secure 6-digit code internally with a 5-minute expiration timer and sends it directly via WhatsApp.
2. Sending: \`POST /v1/otp/send\` accepts \`{ "phone": "+234..." }\`.
3. Verification: \`POST /v1/otp/verify\` accepts \`{ "phone": "+234...", "otp": "123456" }\`. This is where the user's input is validated against our securely stored code.

## Messaging API
- Send Notifications: \`POST /v1/messages/send\` accepts \`{ "to": "+234...", "message": "Hello!", "event": "alert" }\`.

## Infrastructure & Sessions
- wazOTP provides endpoints to manage the underlying WhatsApp connection:
  - \`GET /v1/whatsapp/session/status\` (returns 'connected', 'qr_ready', etc.)
  - \`POST /v1/whatsapp/session/relink\` (forces a reset and generates a new QR code)

## Error Codes
- 400: Bad Request (Missing parameters)
- 401: Unauthorized (Invalid/Missing API Key)
- 403: Forbidden
- 429: Too Many Requests (Rate limit exceeded)
- 500: Internal Server Error (WhatsApp down or DB error)

## Instructions
Keep your answers professional, friendly, concise, and technically accurate. Format your output using markdown (bolding, lists, code blocks) to make it easy to read.`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: { text: systemPrompt }
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: message }]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        request.log.error(`Gemini API Error: ${errorData}`);
        throw new Error('Gemini API returned an error');
      }

      const data = await response.json();
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

      return { reply: replyText };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to communicate with AI service' });
    }
  }
}

module.exports = new ChatController();
