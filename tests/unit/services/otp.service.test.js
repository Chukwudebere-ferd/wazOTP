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

  describe('retrieveOTPs', () => {
    const userId = 1;
    const mockRows = [
      { id: 1, phone: '+2348012345678', status: 'verified', created_at: '2026-06-25T10:00:00Z' },
      { id: 2, phone: '+2348012345679', status: 'pending', created_at: '2026-06-25T11:00:00Z' },
    ];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return OTPs with default fields and pagination', async () => {
      db.query.mockResolvedValueOnce([{ total: 2 }]);
      db.query.mockResolvedValueOnce(mockRows);

      const result = await otpService.retrieveOTPs(userId);

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should filter by phone', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce([mockRows[0]]);

      await otpService.retrieveOTPs(userId, { phone: '+2348012345678' });

      const firstCall = db.query.mock.calls[0];
      expect(firstCall[1]).toContain('+2348012345678');
    });

    it('should filter by status = verified', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce([mockRows[0]]);

      await otpService.retrieveOTPs(userId, { status: 'verified' });

      const firstCall = db.query.mock.calls[0][0];
      expect(firstCall).toContain('verified_at IS NOT NULL');
    });

    it('should filter by status = expired', async () => {
      db.query.mockResolvedValueOnce([{ total: 0 }]);
      db.query.mockResolvedValueOnce([]);

      await otpService.retrieveOTPs(userId, { status: 'expired' });

      const firstCall = db.query.mock.calls[0][0];
      expect(firstCall).toContain('expired_at < CURRENT_TIMESTAMP');
    });

    it('should filter by status = pending', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce([mockRows[1]]);

      await otpService.retrieveOTPs(userId, { status: 'pending' });

      const firstCall = db.query.mock.calls[0][0];
      expect(firstCall).toContain('o.verified_at IS NULL AND o.expired_at >= CURRENT_TIMESTAMP');
    });

    it('should only return requested fields', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce([{ id: 1, phone: '+2348012345678' }]);

      const result = await otpService.retrieveOTPs(userId, {}, ['id', 'phone']);

      expect(result.data[0]).toEqual({ id: 1, phone: '+2348012345678' });
      expect(result.data[0]).not.toHaveProperty('code');
    });

    it('should return code if explicitly requested in fields', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce([{ id: 1, code: '123456' }]);

      const result = await otpService.retrieveOTPs(userId, {}, ['id', 'code']);

      expect(result.data[0].code).toBe('123456');
    });

    it('should support custom pagination', async () => {
      db.query.mockResolvedValueOnce([{ total: 50 }]);
      db.query.mockResolvedValueOnce(mockRows);

      await otpService.retrieveOTPs(userId, {}, null, { page: 2, limit: 10 });

      const secondCall = db.query.mock.calls[1][1];
      expect(secondCall).toContain(10);
      expect(secondCall).toContain(10);
    });

    it('should cap limit at 100', async () => {
      db.query.mockResolvedValueOnce([{ total: 200 }]);
      db.query.mockResolvedValueOnce(mockRows);

      await otpService.retrieveOTPs(userId, {}, null, { page: 1, limit: 999 });

      const secondCall = db.query.mock.calls[1][1];
      expect(secondCall).toContain(100);
    });

    it('should filter by date range', async () => {
      db.query.mockResolvedValueOnce([{ total: 1 }]);
      db.query.mockResolvedValueOnce(mockRows);

      await otpService.retrieveOTPs(userId, {
        date_from: '2026-01-01T00:00:00Z',
        date_to: '2026-12-31T23:59:59Z',
      });

      const firstCall = db.query.mock.calls[0][1];
      expect(firstCall).toContainEqual(new Date('2026-01-01T00:00:00Z'));
      expect(firstCall).toContainEqual(new Date('2026-12-31T23:59:59Z'));
    });

    it('should respect sort options', async () => {
      db.query.mockResolvedValueOnce([{ total: 2 }]);
      db.query.mockResolvedValueOnce(mockRows);

      await otpService.retrieveOTPs(userId, {}, null, {}, { by: 'phone', order: 'asc' });

      const secondCall = db.query.mock.calls[1][0];
      expect(secondCall).toContain('ORDER BY o.phone ASC');
    });

    it('should always scope queries to user_id', async () => {
      db.query.mockResolvedValueOnce([{ total: 0 }]);
      db.query.mockResolvedValueOnce([]);

      await otpService.retrieveOTPs(userId, { phone: '+2348012345678' });

      const firstCall = db.query.mock.calls[0][1];
      expect(firstCall[0]).toBe(userId);
    });

    it('should return empty data array when no OTPs match', async () => {
      db.query.mockResolvedValueOnce([{ total: 0 }]);
      db.query.mockResolvedValueOnce([]);

      const result = await otpService.retrieveOTPs(userId, { phone: '+239999999999' });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
