const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const authService = require("./authService");
const authStore = require("./authStore"); // In-memory session store
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
} = require("../config/jwtConfig");
const {
  successResponse,
  errorResponse,
  notFoundResponse,
} = require("../utils/responseUtils");

// Generate Access and Refresh Tokens
const generateTokens = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
  });

  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRATION,
  });

  return { accessToken, refreshToken };
};

// Register a new user
const register = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return errorResponse(res, "Username and password are required", 400);
  }

  try {
    const userExists = await authService.findUserByUsername(username);
    if (userExists) {
      return errorResponse(res, "Username already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await authService.createUser(username, hashedPassword);

    return successResponse(res, { id: newUser.id, username }, 201);
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// Login user and ensure one active session at a time
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return errorResponse(res, "Username and password are required", 400);
  }

  try {
    const user = await authService.findUserByUsername(username);
    if (
      !user ||
      !(await authService.comparePasswords(password, user.password))
    ) {
      return errorResponse(res, "Invalid credentials", 401);
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save or replace the refresh token in the in-memory store
    authStore.saveRefreshToken(user.id, refreshToken);

    // Set the new refresh token in the cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https", // Only set secure if using HTTPS
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return successResponse(res, { accessToken });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

const guestLogin = async (req, res) => {
  try {
    const guestUser = await authService.findUserByUsername("guest");

    if (!guestUser) {
      return errorResponse(res, "Guest user not found", 404);
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(guestUser);

    // Save or replace the refresh token in the in-memory store
    authStore.saveRefreshToken(guestUser.id, refreshToken);

    // Set the new refresh token in the cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return successResponse(res, { accessToken });
  } catch (error) {
    logger.error(`Guest login error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// Refresh access token using a valid refresh token
const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return errorResponse(res, "Refresh token required", 401);
  }

  try {
    const userId = authStore.findUserByRefreshToken(refreshToken);

    if (!userId) {
      return errorResponse(res, "Invalid refresh token", 403);
    }

    // Verify the refresh token
    jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
      if (err || user.id !== userId) {
        return errorResponse(res, "Invalid refresh token", 403);
      }

      // Generate new access token
      const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );

      return successResponse(res, { accessToken });
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// Logout and invalidate refresh token
const logout = (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return errorResponse(res, "No active session found", 400);
  }

  try {
    // Find the user associated with the refresh token
    const userId = authStore.findUserByRefreshToken(refreshToken);
    if (userId) {
      // Invalidate the refresh token
      authStore.invalidateRefreshToken(userId, refreshToken);
    }

    // Clear the refresh token cookie
    res.clearCookie("refreshToken");

    return successResponse(res, { message: "Logged out" });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  const { id } = req.params;
  const updateFields = req.body;

  if (!id || Object.keys(updateFields).length === 0) {
    return errorResponse(res, "Invalid input data", 400);
  }

  try {
    const updatedUser = await authService.updateUserProfile(id, updateFields);

    if (!updatedUser) {
      return notFoundResponse(res, "User not found");
    }

    logger.info(`User profile with id '${id}' updated successfully`);
    return successResponse(res, { message: "Profile updated successfully" });
  } catch (error) {
    logger.error(`Error updating profile with id '${id}': ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

const updateUserProfile = async (req, res) => {
  const userId = req.user.id;
  const updateFields = req.body;

  if (Object.keys(updateFields).length === 0) {
    return errorResponse(res, "Invalid input data", 400);
  }

  try {
    const updatedUser = await authService.updateUserProfile(userId, updateFields);

    if (!updatedUser) {
      return notFoundResponse(res, "User not found");
    }

    logger.info(`User profile with id '${userId}' updated successfully`);
    return successResponse(res, { message: "Profile updated successfully" });
  } catch (error) {
    logger.error(`Error updating profile with id '${userId}': ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
}

const deleteProfile = async (req, res) => {
  const userId = req.user.id;

  if (!id) {
    return errorResponse(res, "Invalid input data", 400);
  }

  try {
    const deletedUser = await authService.deleteUser(userId);

    if (!deletedUser) {
      return notFoundResponse(res, "User not found");
    }

    logger.info(`User with id '${id}' deleted successfully`);
    return successResponse(res, { message: "User deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting user with id '${id}': ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

module.exports = {
  register,
  login,
  guestLogin,
  refreshAccessToken,
  logout,
  updateProfile,
  updateUserProfile,
  deleteProfile,
};
