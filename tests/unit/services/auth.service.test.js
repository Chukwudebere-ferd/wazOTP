const authService = require('../../../src/services/auth.service');
const db = require('../../../src/lib/db');
const firebase = require('../../../src/lib/firebase');

jest.mock('../../../src/lib/db');
jest.mock('../../../src/lib/firebase');

describe('AuthService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateApiKey', () => {
    it('should return userId for valid active API key', async () => {
      const apiKey = 'sk_live_test123';
      const userId = 1;

      db.query.mockResolvedValue([{ user_id: userId }]);

      const result = await authService.validateApiKey(apiKey);

      expect(result).toBe(userId);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT user_id[\s\S]*FROM api_keys/),
        [apiKey]
      );
    });

    it('should return null for invalid API key', async () => {
      db.query.mockResolvedValue([]);

      const result = await authService.validateApiKey('invalid_key');

      expect(result).toBeNull();
    });
  });

  describe('generateApiKey', () => {
    it('should generate and store API key', async () => {
      const userId = 1;
      db.query.mockResolvedValue([]);

      const key = await authService.generateApiKey(userId);

      expect(key).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([userId, key, 'active'])
      );
    });
  });

  describe('linkFirebaseUser', () => {
    it('should link Firebase user and generate API key', async () => {
      const firebaseUid = 'firebase123';
      const email = 'test@example.com';
      const userId = 1;

      db.query.mockResolvedValueOnce([]);
      db.query.mockResolvedValueOnce([
        {
          id: userId,
          email,
          firebase_uid: firebaseUid,
        },
      ]);
      db.query.mockResolvedValueOnce([]);
      db.query.mockResolvedValueOnce([{ key: 'sk_live_test' }]);

      const result = await authService.linkFirebaseUser(firebaseUid, email);

      expect(result.user.id).toBe(userId);
      expect(result.user.email).toBe(email);
      expect(result.apiKey).toBeDefined();
    });

    it('should throw if user not found after sync', async () => {
      db.query.mockResolvedValueOnce([]);
      db.query.mockResolvedValueOnce([]);

      await expect(authService.linkFirebaseUser('firebase123', 'test@example.com')).rejects.toThrow();
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      const userId = 1;
      const user = {
        id: userId,
        email: 'test@example.com',
        firebase_uid: 'firebase123',
      };

      db.query.mockResolvedValue([user]);

      const result = await authService.getUserById(userId);

      expect(result).toEqual(user);
    });

    it('should return null if user not found', async () => {
      db.query.mockResolvedValue([]);

      const result = await authService.getUserById(999);

      expect(result).toBeNull();
    });
  });

  describe('verifyFirebaseToken', () => {
    it('should return decoded token for valid token', async () => {
      const idToken = 'valid.token.here';
      const decodedToken = {
        uid: 'firebase123',
        email: 'test@example.com',
        iat: 1234567890,
        exp: 1234571490,
      };

      firebase.isFirebaseReady.mockReturnValue(true);
      firebase.getFirebaseAdmin.mockReturnValue({
        auth: () => ({
          verifyIdToken: jest.fn().mockResolvedValue(decodedToken),
        }),
      });

      const result = await authService.verifyFirebaseToken(idToken);

      expect(result).toEqual(decodedToken);
    });

    it('should throw if Firebase not ready', async () => {
      firebase.isFirebaseReady.mockReturnValue(false);

      await expect(authService.verifyFirebaseToken('token')).rejects.toThrow('Firebase authentication is currently unavailable');
    });

    it('should return null for invalid token', async () => {
      firebase.isFirebaseReady.mockReturnValue(true);
      firebase.getFirebaseAdmin.mockReturnValue({
        auth: () => ({
          verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token')),
        }),
      });

      const result = await authService.verifyFirebaseToken('invalid.token');

      expect(result).toBeNull();
    });
  });

  describe('getActiveApiKeyForUser', () => {
    it('should return active API key for user', async () => {
      const userId = 1;
      const apiKeyRecord = {
        key: 'sk_live_test123',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      db.query.mockResolvedValue([apiKeyRecord]);

      const result = await authService.getActiveApiKeyForUser(userId);

      expect(result).toEqual(apiKeyRecord);
    });

    it('should return null if no active key found', async () => {
      db.query.mockResolvedValue([]);

      const result = await authService.getActiveApiKeyForUser(1);

      expect(result).toBeNull();
    });
  });
});
