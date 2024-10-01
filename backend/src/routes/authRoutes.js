const express = require("express");
const router = express.Router();
const checkPasswordStrength = require("../middlewares/passwordStrengthMiddleware");
const {
  register,
  login,
  refreshAccessToken,
  logout,
  updateProfile,
} = require("../auth/authController");
const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware");
const { loginLimiter } = require("../middlewares/rateLimiter");

// User registration with password strength check
router.post("/register", checkPasswordStrength, register);

// User login
router.post("/login", loginLimiter, login);

// Refresh access token
router.post("/refresh-token", refreshAccessToken);

// User logout
router.post("/logout", logout);

// Update user profile (admin access required)
router.put("/update/:id", authenticateToken, isAdmin, updateProfile);

module.exports = router;
