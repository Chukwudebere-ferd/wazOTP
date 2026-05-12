/**
 * wazOTP Integration Test Script
 * Usage: node test-api.js <YOUR_API_KEY>
 */

const apiKey = process.argv[2];
const phoneNumber = "2347046444777";
const baseUrl = "http://localhost:3000/v1";

if (!apiKey) {
  console.error("❌ Error: Please provide your API Key.");
  console.log("Usage: node test-api.js sk_live_...");
  process.exit(1);
}

async function runTest() {
  console.log("🚀 Starting wazOTP Integration Test...");
  console.log(`📱 Target Number: ${phoneNumber}\n`);

  // 1. Test Notification
  try {
    console.log("📤 Testing Notification API...");
    const notifyResponse = await fetch(`${baseUrl}/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: phoneNumber,
        message: "Hello! This is a test notification from wazOTP. Your platform is working perfectly! ✅",
        event: "integration_test"
      })
    });

    const notifyData = await notifyResponse.json();
    if (notifyResponse.ok) {
      console.log("✅ Notification Sent Successfully!");
    } else {
      console.log("❌ Notification Failed:", notifyData.message);
    }
  } catch (err) {
    console.error("💥 Notification Error:", err.message);
  }

  console.log("\n-------------------\n");

  // 2. Test OTP
  try {
    console.log("🔑 Testing OTP Send API...");
    const otpResponse = await fetch(`${baseUrl}/otp/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone: phoneNumber })
    });

    const otpData = await otpResponse.json();
    if (otpResponse.ok) {
      console.log("✅ OTP Sent Successfully! Check your WhatsApp.");
    } else {
      console.log("❌ OTP Send Failed:", otpData.message);
    }
  } catch (err) {
    console.error("💥 OTP Error:", err.message);
  }

  console.log("\n🏁 Test complete.");
}

runTest();
