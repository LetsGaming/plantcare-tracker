const MAX_SESSIONS = 3; // Set the max allowed sessions per user
const activeSessions = new Map();

// Save a user's refresh token (limit sessions)
const saveRefreshToken = (userId, refreshToken) => {
  if (!activeSessions.has(userId)) {
    activeSessions.set(userId, []);
  }

  let sessions = activeSessions.get(userId);

  // Enforce session limit
  if (sessions.length >= MAX_SESSIONS) {
    // Remove the oldest session (FIFO - first in, first out)
    sessions.shift();
  }

  // Store the new refresh token
  sessions.push(refreshToken);
  activeSessions.set(userId, sessions);
};

// Get all refresh tokens for a specific user
const getRefreshTokens = (userId) => {
  return activeSessions.get(userId) || [];
};

// Invalidate a specific refresh token (on logout)
const invalidateRefreshToken = (userId, refreshToken) => {
  if (activeSessions.has(userId)) {
    let sessions = activeSessions.get(userId).filter(token => token !== refreshToken);
    activeSessions.set(userId, sessions);
  }
};

// Delete all refresh tokens for a specific user (on profile change)
const deleteRefreshTokens = (userId) => {
  activeSessions.delete(userId);
};

// Find user by refresh token (support multiple)
const findUserByRefreshToken = (refreshToken) => {
  for (const [userId, tokens] of activeSessions.entries()) {
    if (tokens.includes(refreshToken)) {
      return userId;
    }
  }
  return null;
};

module.exports = {
  saveRefreshToken,
  getRefreshTokens,
  invalidateRefreshToken,
  findUserByRefreshToken,
  deleteRefreshTokens,
};
