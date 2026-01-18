const express = require("express");
const router = express.Router();
const checkPasswordStrength = require("../middlewares/passwordStrengthMiddleware");
const {
  register,
  login,
  guestLogin,
  refreshAccessToken,
  requestTicket,
  logout,
  updateProfile,
  updateUserProfile,
  deleteProfile,
} = require("../auth/authController");
const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware");
const { loginLimiter } = require("../middlewares/rateLimiter");
const {cleanRequestBody} = require("../middlewares/generalMiddleware");

// User registration with password strength check
router.post("/register", checkPasswordStrength, register);

// User login
router.post("/login", loginLimiter, login);

router.post("/login/guest", guestLogin);

// Refresh access token
router.post("/refresh-token", refreshAccessToken);

// Request SSE ticket
router.post("/request-ticket", authenticateToken, requestTicket);

// User logout
router.post("/logout", logout);

// Update user profile (admin access required)
router.put("/update/:id", authenticateToken, isAdmin, cleanRequestBody, updateProfile);

// Update user profile
router.put("/update", authenticateToken, cleanRequestBody, updateUserProfile);

// Delete user profile
router.delete("/delete", authenticateToken, deleteProfile);

module.exports = router;
