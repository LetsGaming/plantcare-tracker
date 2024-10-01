// In-memory store for active sessions (single server only)
const activeSessions = new Map();

// Save or update a user's refresh token
const saveRefreshToken = (userId, refreshToken) => {
  activeSessions.set(userId, refreshToken);
};

// Get the refresh token for a specific user
const getRefreshToken = (userId) => {
  return activeSessions.get(userId);
};

// Invalidate a user's refresh token (on logout or new login)
const invalidateRefreshToken = (userId) => {
  activeSessions.delete(userId);
};

// Find a user by refresh token (to match token to a user)
const findUserByRefreshToken = (refreshToken) => {
  for (const [userId, token] of activeSessions.entries()) {
    if (token === refreshToken) {
      return userId;
    }
  }
  return null;
};

module.exports = {
  saveRefreshToken,
  getRefreshToken,
  invalidateRefreshToken,
  findUserByRefreshToken,
};
