const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
} = require("../config/jwtConfig");
const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/responseUtils");

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

const register = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const [existingUser] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (existingUser.length > 0) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );
    res.status(201).json({ id: result.insertId, username });
  } catch (err) {
    logger.error(err);
    errorResponse(res, "Internal Server Error");
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    if (users.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const { accessToken, refreshToken } = generateTokens(user);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    successResponse(res, { accessToken: accessToken });
  } catch (err) {
    logger.error(err);
    errorResponse(res, "Internal Server Error");
  }
};

const refreshAccessToken = (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken)
    return res.status(401).json({ error: "Refresh token required" });

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid refresh token" });

    const accessToken = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    successResponse(res, { accessToken: accessToken });
  });
};

const logout = (req, res) => {
  res.clearCookie("refreshToken");
  successResponse(res, { message: "Logged out" });
};

const updateProfile = async (req, res) => {
  const { id } = req.params;
  const updateFields = req.body;

  if (!id || Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "Invalid input data" });
  }

  try {
    const updateSetClause = Object.keys(updateFields)
      .map((field) => `${field} = ?`)
      .join(", ");

    const values = [...Object.values(updateFields), id];
    const sql = `UPDATE users SET ${updateSetClause} WHERE id = ?`;

    const [result] = await pool.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(`User profile with id '${id}' updated successfully`);
    successResponse(res, { message: "Profile updated successfully" });
  } catch (error) {
    logger.error(`Error updating profile with id '${id}': ${error.message}`);
    errorResponse(res, "Internal Server Error");
  }
};

module.exports = { register, login, refreshAccessToken, logout, updateProfile };
