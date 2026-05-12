# wazOTP 🚀

**WhatsApp OTP Gateway for Developers**

wazOTP is a developer-focused API platform that enables businesses to send and verify OTPs (One-Time Passwords) via WhatsApp using their own connected numbers.

It allows developers to:

* Connect a WhatsApp account (via QR or pairing code)
* Generate API keys
* Send OTPs programmatically
* Verify OTPs securely

---

## ✨ Features

* 🔑 API Key Authentication
* 📲 WhatsApp Number Linking (Baileys)
* 🔢 OTP Generation & Verification
* ⚡ Fast API for developers
* 🧠 Session persistence per user
* 🛡 Rate limiting & abuse protection
* 📊 Developer dashboard (planned)

---

## 🧠 How It Works

1. Developer signs up on wazOTP
2. Connects their WhatsApp number
3. Gets an API key
4. Uses wazOTP API to send OTPs
5. Users receive OTP via WhatsApp
6. Developer verifies OTP via API

---

## 🏗 Architecture Overview

```text
Client App → wazOTP API → OTP Service → WhatsApp (Baileys)
```

### Components:

* **API Layer** → Handles requests & authentication
* **OTP Service** → Generates and verifies OTPs
* **WhatsApp Layer (Baileys)** → Sends messages
* **Storage**

  * Redis → OTP storage (with expiry)
  * PostgreSQL → Users, API keys, sessions

---

## 🔐 Authentication

All API requests require an API key:

```http
Authorization: Bearer sk_live_xxxxxxxxx
```

---

## 📡 API Reference

### 🔹 Send OTP

**POST** `/v1/otp/send`

#### Request

```json
{
  "phone": "+2348012345678"
}
```

#### Headers

```http
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

#### Response

```json
{
  "success": true,
  "message": "OTP sent"
}
```

---

### 🔹 Verify OTP

**POST** `/v1/otp/verify`

#### Request

```json
{
  "phone": "+2348012345678",
  "otp": "123456"
}
```

#### Response

```json
{
  "success": true,
  "message": "OTP verified"
}
```

---

## 🔌 WhatsApp Integration

Each developer connects their own WhatsApp account.

### Supported Methods:

* QR Code Scan
* Pairing Code (recommended)

### Internally:

* Each user gets a separate Baileys session
* Sessions are persisted on disk/database
* Reconnection is handled automatically

---

## 🔑 API Key Generation

Example:

```js
import crypto from "crypto"

const apiKey = "sk_" + crypto.randomBytes(24).toString("hex")
```

---

## 🔢 OTP Logic

* OTP: 6-digit numeric code
* Expiry: 5 minutes
* Stored in Redis

Example:

```js
const otp = Math.floor(100000 + Math.random() * 900000)

await redis.set(`otp:${phone}`, otp, "EX", 300)
```

---

## ⚙️ Tech Stack

* **Backend:** Node.js (Fastify recommended)
* **WhatsApp:** Baileys
* **Database:** PostgreSQL
* **Cache:** Redis
* **Queue (optional):** BullMQ

---

## 📁 Project Structure

```bash
src/
  controllers/
  routes/
  services/
    otp.service.js
    whatsapp.service.js
  middleware/
    auth.js
  lib/
    redis.js
    db.js
  sessions/
    (Baileys auth states)
```

---

## 🛡 Security & Best Practices

* Rate limit OTP requests (e.g. 5/min per API key)
* Do not expose OTP in logs
* Use HTTPS only
* Validate all inputs (Zod/Joi)
* Prevent spam & abuse

---

## ⚠️ Limitations (Baileys)

* Not officially supported by WhatsApp
* Risk of number bans
* Not ideal for production-scale SaaS

---

## 🚀 Roadmap

* [ ] Developer Dashboard UI
* [ ] Usage analytics
* [ ] Webhooks (delivery status)
* [ ] Multi-device session handling
* [ ] Official WhatsApp API integration
* [ ] Billing system

---

## 🧪 Development Setup

```bash
git clone https://github.com/yourusername/wazotp
cd wazotp
npm install
```

### Environment Variables

```env
PORT=3000
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```

### Run Server

```bash
npm run dev
```

---

## 💡 Example Usage (Node.js)

```js
await fetch("https://api.wazotp.com/v1/otp/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_xxx",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    phone: "+2348012345678"
  })
})
```

---

## 🤝 Contribution

Pull requests are welcome. For major changes, open an issue first.

---

## 🧪 Testing the API

You can use the included test script to verify your setup:

1. Copy your API Key from the Dashboard.
2. Run the following command:
   ```bash
   node test-api.js YOUR_API_KEY
   ```
   This will send a test notification and an OTP to a predefined number.

## 📄 License

MIT

---

## ⚡ Final Note

wazOTP is designed as a **developer-first OTP infrastructure**.

Baileys is used for rapid prototyping, but migrating to the official WhatsApp Business API is recommended for production use.

---
