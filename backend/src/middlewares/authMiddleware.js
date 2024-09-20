const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwtConfig");
const logger = require("../utils/logger");

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401); // Unauthorized
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.error("Authentication error", err);
      return res.sendStatus(403); // Forbidden
    }
    req.user = user;
    next();
  });
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  const { role } = req.user || {};

  if (role?.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }

  next();
};

module.exports = { authenticateToken, isAdmin };
