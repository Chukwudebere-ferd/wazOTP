const authMiddleware = require('../../../src/middleware/auth');
const authService = require('../../../src/services/auth.service');

jest.mock('../../../src/services/auth.service');

describe('Auth Middleware', () => {
  let mockRequest;
  let mockReply;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      log: { error: jest.fn() },
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass valid API key', async () => {
    const apiKey = 'sk_live_test123';
    const userId = 1;
    mockRequest.headers.authorization = `Bearer ${apiKey}`;

    authService.validateApiKey.mockResolvedValue(userId);

    await authMiddleware(mockRequest, mockReply);

    expect(mockRequest.userId).toBe(userId);
    expect(mockRequest.developerId).toBe('dev_1');
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it('should reject missing authorization header', async () => {
    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized: Missing or invalid API key',
    });
  });

  it('should reject invalid bearer format', async () => {
    mockRequest.headers.authorization = 'InvalidFormat sk_live_test123';

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
  });

  it('should reject invalid API key', async () => {
    const apiKey = 'sk_live_invalid';
    mockRequest.headers.authorization = `Bearer ${apiKey}`;

    authService.validateApiKey.mockResolvedValue(null);

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden: Invalid or inactive API key',
    });
  });

  it('should handle Firebase errors gracefully', async () => {
    mockRequest.headers.authorization = 'Bearer sk_live_test';

    authService.validateApiKey.mockRejectedValue(
      new Error('Firebase authentication is currently unavailable')
    );

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Firebase authentication is currently unavailable',
    });
  });

  it('should handle unexpected errors', async () => {
    mockRequest.headers.authorization = 'Bearer sk_live_test';

    authService.validateApiKey.mockRejectedValue(new Error('Unexpected error'));

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error during authentication',
    });
  });
});
