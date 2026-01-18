const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwtConfig");
const authStore = require("../auth/authStore");
const {
  errorResponse
} = require("../utils/responseUtils");
const { validateAndBurnTicket } = require("../auth/ticketStore");

// Middleware to authenticate JWT tokens and ensure session is valid
const authenticateToken = (req, res, next) => {
  let token = null;

  // 1. Authorization header (fetch)
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Cookie (EventSource)
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return errorResponse(res, "Missing authentication token", 401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return errorResponse(res, "Invalid or expired token", 403, err);
    }

    const currentRefreshTokens = authStore.getRefreshTokens(user.id);
    if (!currentRefreshTokens) {
      return errorResponse(res, "Invalid session. Please log in again.", 403);
    }

    req.user = user;
    next();
  });
};

const authenticateSSE = (req, res, next) => {
  const { ticket } = req.query;

  if (!ticket) {
    return res
      .status(401)
      .json({ message: "No authentication ticket provided" });
  }

  const userId = validateAndBurnTicket(ticket);

  if (!userId) {
    return res.status(403).json({ message: "Invalid or expired ticket" });
  }

  // Attach user to request
  req.user = { id: userId };
  next();
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  const { role } = req.user || {};

  if (role?.toLowerCase() !== "admin") {
    return errorResponse(res, "Admin access required", 403);
  }

  next(); // Proceed to the next middleware or route handler
};

function isGuest(req) {
  const { role } = req.user || {};

  if (role?.toLowerCase() === "guest") {
    return true;
  }

  return false;
}

const checkGuestPermission = (req, res, next) => {
  // Check if the user is authenticated or a guest
  const method = req.method;

  // If the user is a guest and tries to access a non-GET route, deny access
  if (isGuest(req) && method !== "GET") {
    return errorResponse(
      res,
      "Guests are not allowed to perform this action",
      403,
    );
  }

  next();
};

module.exports = {
  authenticateToken,
  authenticateSSE,
  isAdmin,
  checkGuestPermission,
};
