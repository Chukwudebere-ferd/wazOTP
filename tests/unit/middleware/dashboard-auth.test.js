const dashboardAuth = require('../../../src/middleware/dashboard-auth');
const authService = require('../../../src/services/auth.service');

jest.mock('../../../src/services/auth.service');

describe('Dashboard Auth Middleware', () => {
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

  it('should authenticate valid Firebase token', async () => {
    const idToken = 'valid.firebase.token';
    const decodedToken = {
      uid: 'firebase123',
      email: 'test@example.com',
    };
    const user = {
      id: 1,
      email: 'test@example.com',
    };

    mockRequest.headers.authorization = `Bearer ${idToken}`;

    authService.verifyFirebaseToken.mockResolvedValue(decodedToken);
    authService.linkFirebaseUser.mockResolvedValue({ user });

    await dashboardAuth(mockRequest, mockReply);

    expect(mockRequest.authUser).toEqual({
      id: user.id,
      email: user.email,
      firebaseUid: decodedToken.uid,
    });
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it('should reject missing authorization header', async () => {
    await dashboardAuth(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized: Missing Firebase bearer token',
    });
  });

  it('should reject invalid bearer format', async () => {
    mockRequest.headers.authorization = 'InvalidFormat token';

    await dashboardAuth(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
  });

  it('should reject invalid Firebase token', async () => {
    const idToken = 'invalid.firebase.token';
    mockRequest.headers.authorization = `Bearer ${idToken}`;

    authService.verifyFirebaseToken.mockResolvedValue(null);

    await dashboardAuth(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized: Invalid Firebase token',
    });
  });

  it('should handle Firebase errors', async () => {
    mockRequest.headers.authorization = 'Bearer token';

    authService.verifyFirebaseToken.mockRejectedValue(
      new Error('Firebase is not configured.')
    );

    await dashboardAuth(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Firebase is not configured.',
    });
  });

  it('should handle database errors', async () => {
    const idToken = 'valid.token';
    const decodedToken = {
      uid: 'firebase123',
      email: 'test@example.com',
    };

    mockRequest.headers.authorization = `Bearer ${idToken}`;

    authService.verifyFirebaseToken.mockResolvedValue(decodedToken);
    authService.linkFirebaseUser.mockRejectedValue(
      new Error('Database connection failed')
    );

    await dashboardAuth(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error during dashboard authentication',
    });
  });

  it('should handle token with null email', async () => {
    const idToken = 'valid.token';
    const decodedToken = {
      uid: 'firebase123',
      email: undefined,
    };
    const user = {
      id: 1,
      email: null,
    };

    mockRequest.headers.authorization = `Bearer ${idToken}`;

    authService.verifyFirebaseToken.mockResolvedValue(decodedToken);
    authService.linkFirebaseUser.mockResolvedValue({ user });

    await dashboardAuth(mockRequest, mockReply);

    expect(mockRequest.authUser).toEqual({
      id: user.id,
      email: null,
      firebaseUid: decodedToken.uid,
    });
  });
});
