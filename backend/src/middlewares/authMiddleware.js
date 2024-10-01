const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwtConfig");
const logger = require("../utils/logger");
const authStore = require("../auth/authStore");

// Middleware to authenticate JWT tokens and ensure session is valid
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401); // Unauthorized: No token provided
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.error("Authentication error", err);
      return res.sendStatus(403); // Forbidden: Invalid token
    }

    // Check if the user still has an active session (valid refresh token)
    const currentRefreshToken = authStore.getRefreshToken(user.id);

    if (!currentRefreshToken) {
      logger.error(`No active session found for user ID: ${user.id}`);
      return res.status(403).json({ error: "Invalid session. Please log in again." });
    }

    req.user = user; // Attach user info to request object
    next(); // Proceed to the next middleware or route handler
  });
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  const { role } = req.user || {};

  if (role?.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }

  next(); // Proceed to the next middleware or route handler
};

module.exports = { authenticateToken, isAdmin };
