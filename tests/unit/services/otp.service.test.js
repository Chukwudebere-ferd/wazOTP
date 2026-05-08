const otpService = require('../../../src/services/otp.service');
const db = require('../../../src/lib/db');

jest.mock('../../../src/lib/db');

describe('OTPService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOTP', () => {
    it('should generate a 6-digit OTP and insert into database', async () => {
      const phone = '+2348012345678';
      const userId = 1;

      db.query.mockResolvedValue([]);

      const otp = await otpService.generateOTP(phone, userId);

      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO otps'),
        expect.arrayContaining([userId, phone, otp])
      );
    });

    it('should store OTP with 5-minute expiry', async () => {
      const phone = '+2348012345678';
      const userId = 1;
      db.query.mockResolvedValue([]);

      const before = Date.now();
      await otpService.generateOTP(phone, userId);
      const after = Date.now();

      const callArgs = db.query.mock.calls[0];
      const expiredAt = callArgs[1][3];

      expect(expiredAt).toBeInstanceOf(Date);
      expect(expiredAt.getTime()).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 1000);
      expect(expiredAt.getTime()).toBeLessThanOrEqual(after + 5 * 60 * 1000 + 1000);
    });
  });

  describe('verifyOTP', () => {
    it('should return true for valid OTP', async () => {
      const phone = '+2348012345678';
      const userId = 1;
      const code = '123456';
      const expiredAt = new Date(Date.now() + 5 * 60 * 1000);

      db.query.mockResolvedValueOnce([
        {
          id: 1,
          code,
          expired_at: expiredAt,
          verified_at: null,
        },
      ]);
      db.query.mockResolvedValueOnce([]);

      const result = await otpService.verifyOTP(phone, code, userId);

      expect(result).toBe(true);
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE otps'), [1]);
    });

    it('should return false for expired OTP', async () => {
      const phone = '+2348012345678';
      const userId = 1;
      const code = '123456';
      const expiredAt = new Date(Date.now() - 1000);

      db.query.mockResolvedValue([
        {
          id: 1,
          code,
          expired_at: expiredAt,
          verified_at: null,
        },
      ]);

      const result = await otpService.verifyOTP(phone, code, userId);

      expect(result).toBe(false);
    });

    it('should return false for non-matching OTP', async () => {
      const phone = '+2348012345678';
      const userId = 1;
      const expiredAt = new Date(Date.now() + 5 * 60 * 1000);

      db.query.mockResolvedValue([
        {
          id: 1,
          code: '123456',
          expired_at: expiredAt,
          verified_at: null,
        },
      ]);

      const result = await otpService.verifyOTP(phone, '999999', userId);

      expect(result).toBe(false);
    });

    it('should return false if no OTP found', async () => {
      db.query.mockResolvedValue([]);

      const result = await otpService.verifyOTP('+2348012345678', '123456', 1);

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpiredOTPs', () => {
    it('should delete expired OTPs', async () => {
      db.query.mockResolvedValue([]);

      await otpService.cleanupExpiredOTPs();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp('DELETE.+FROM.+otps.+WHERE.+expired_at', 's'))
      );
    });
  });
});
