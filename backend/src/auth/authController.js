const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const authService = require("./authService");
const authStore = require("./authStore"); // In-memory session store
const { createTicket } = require("../auth/ticketStore");
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

const { versionPath } = require("../../package.json");

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
    const userExists = await authService.selectUserByUsername(username);
    if (userExists) {
      return errorResponse(res, "Username already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await authService.createUser(username, hashedPassword);

    return successResponse(
      res,
      { id: newUser.id, username },
      "User created successfully",
      201,
    );
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
    const user = await authService.selectUserByUsername(username);
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
      path: `/api/${versionPath}/auth/refresh-token`,
    });

    return successResponse(res, { accessToken });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

const guestLogin = async (req, res) => {
  try {
    const guestUser = await authService.selectUserByUsername("guest");

    if (!guestUser) {
      return notFoundResponse(res, "Guest user not found");
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(guestUser);

    // Save or replace the refresh token in the in-memory store
    authStore.saveRefreshToken(guestUser.id, refreshToken);

    // Set the new refresh token in the cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https", // Only set secure if using HTTPS
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
      res.clearCookie("refreshToken");
      return errorResponse(res, "Invalid refresh token", 403);
    }

    // Verify the refresh token
    jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
      if (err || user.id !== userId) {
        res.clearCookie("refreshToken");
        return errorResponse(res, "Invalid refresh token", 403);
      }

      // Generate new access token
      const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION },
      );

      return successResponse(res, { accessToken });
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

const requestTicket = (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return errorResponse(res, "Invalid refresh token", 403);
    }
    const ticket = createTicket(userId);
    return successResponse(res, { ticket }, "Ticket created successfully");
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500, error);
  }
};

// Logout and invalidate refresh token
const logout = (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  // Always clear the cookie
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    sameSite: "Strict",
    path: `/api/${versionPath}/auth/refresh-token`,
  });

  if (refreshToken) {
    try {
      const userId = authStore.findUserByRefreshToken(refreshToken);
      if (userId) {
        authStore.invalidateRefreshToken(userId, refreshToken);
      }
    } catch (error) {
      logger.error(`Logout error: ${error.message}`);
      // Even if something goes wrong internally, we don't fail logout for the user
    }
  }

  // Always return success to avoid leaking session info
  return successResponse(res, { loggedOut: true }, "Logged out successfully");
};

// Update user profile
const updateProfile = async (req, res) => {
  const { id } = req.params;
  // Clone the request body to avoid modifying the original object directly
  const updateFields = { ...req.body };

  if (!id || Object.keys(updateFields).length === 0) {
    return errorResponse(res, "Invalid input data", 400);
  }

  // Check if a password update is requested
  if (updateFields.password) {
    // Ensure passwordConfirmation is provided
    if (!updateFields.passwordConfirmation) {
      return errorResponse(res, "Password confirmation is required", 400);
    }
    // Ensure the password and confirmation match
    if (updateFields.password !== updateFields.passwordConfirmation) {
      return errorResponse(res, "Passwords do not match", 400);
    }
    try {
      // Hash the new password before updating
      updateFields.password = await bcrypt.hash(updateFields.password, 10);
    } catch (hashError) {
      logger.error(`Password hashing error: ${hashError.message}`);
      return errorResponse(res, "Error processing password", 500);
    }
    // Remove the confirmation field as it's no longer needed
    delete updateFields.passwordConfirmation;
  }

  try {
    const updatedUser = await authService.updateUserProfile(id, updateFields);

    if (!updatedUser) {
      return notFoundResponse(res, "User not found");
    }

    logger.info(`User profile with id '${id}' updated successfully`);
    return successResponse(
      res,
      { updated: true },
      "Profile updated successfully",
    );
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
    const updatedUser = await authService.updateUserProfile(
      userId,
      updateFields,
    );

    if (!updatedUser) {
      return notFoundResponse(res, "User not found");
    }

    authStore.deleteRefreshTokens(userId);

    logger.info(`User profile with id '${userId}' updated successfully`);
    return successResponse(
      res,
      { updated: true },
      "Profile updated successfully",
    );
  } catch (error) {
    logger.error(
      `Error updating profile with id '${userId}': ${error.message}`,
    );
    return errorResponse(res, "Internal Server Error", 500);
  }
};

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
    authStore.deleteRefreshTokens(userId);
    logger.info(`User with id '${id}' deleted successfully`);
    return successResponse(
      res,
      { deleted: true },
      "Profile deleted successfully",
    );
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
  requestTicket,
  logout,
  updateProfile,
  updateUserProfile,
  deleteProfile,
};
