class OTPService {
  constructor() {
    // Using a Map for in-memory storage
    // Key: phone, Value: { otp, expiry }
    this.otpStore = new Map();
  }

  /**
   * Generates a 6-digit OTP and stores it in memory
   * @param {string} phone - User phone number
   * @returns {Promise<string>} - The generated OTP
   */
  async generateOTP(phone) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes from now
    
    this.otpStore.set(phone, { otp, expiry });

    // Automatically clean up after 5 minutes
    setTimeout(() => {
      const stored = this.otpStore.get(phone);
      if (stored && stored.expiry <= Date.now()) {
        this.otpStore.delete(phone);
      }
    }, 5 * 60 * 1000);

    return otp;
  }

  /**
   * Verifies if the provided OTP matches the one in memory
   * @param {string} phone - User phone number
   * @param {string} otp - Provided OTP
   * @returns {Promise<boolean>}
   */
  async verifyOTP(phone, otp) {
    const stored = this.otpStore.get(phone);
    
    if (!stored) return false;
    
    // Check if expired
    if (Date.now() > stored.expiry) {
      this.otpStore.delete(phone);
      return false;
    }
    
    if (stored.otp === otp) {
      this.otpStore.delete(phone);
      return true;
    }

    return false;
  }
}

module.exports = new OTPService();
