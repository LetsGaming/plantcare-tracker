const bcrypt = require("bcryptjs");
const pool = require("../config/db"); // Assuming you're using a database connection pool for user data
const logger = require("../utils/logger");

// Find user by username
const findUserByUsername = async (username) => {
  try {
    const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (users.length > 0) {
      return users[0]; // Return the first user found
    }
    return null; // User not found
  } catch (error) {
    logger.error(`Error finding user by username '${username}': ${error.message}`);
    throw new Error("Error finding user");
  }
};

// Create a new user
const createUser = async (username, password) => {
  try {
    const [result] = await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, password]);
    return { id: result.insertId, username }; // Return the newly created user's ID and username
  } catch (error) {
    logger.error(`Error creating user '${username}': ${error.message}`);
    throw new Error("Error creating user");
  }
};

// Compare plain text password with hashed password
const comparePasswords = async (plainPassword, hashedPassword) => {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    logger.error(`Error comparing passwords: ${error.message}`);
    throw new Error("Error comparing passwords");
  }
};

// Update user profile by user ID
const updateUserProfile = async (userId, updateFields) => {
  try {
    const updateSetClause = Object.keys(updateFields)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = [...Object.values(updateFields), userId];
    const sql = `UPDATE users SET ${updateSetClause} WHERE id = ?`;

    const [result] = await pool.query(sql, values);

    if (result.affectedRows === 0) {
      return null; // User not found
    }
    return { id: userId, ...updateFields }; // Return updated user data
  } catch (error) {
    logger.error(`Error updating profile for user ID '${userId}': ${error.message}`);
    throw new Error("Error updating user profile");
  }
};

module.exports = {
  findUserByUsername,
  createUser,
  comparePasswords,
  updateUserProfile,
};
