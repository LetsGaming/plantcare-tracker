const passwordCriteria = {
  minLength: 8,
  rules: [
    { test: (password) => password.length >= 8, message: "Password must be at least 8 characters long." },
    { test: (password) => /[A-Z]/.test(password), message: "Password must contain at least one uppercase letter." },
    { test: (password) => /[a-z]/.test(password), message: "Password must contain at least one lowercase letter." },
    { test: (password) => /[0-9]/.test(password), message: "Password must contain at least one number." },
    { test: (password) => /[!@#$%^&*(),.?":{}|<>]/.test(password), message: "Password must contain at least one special character." },
  ],
};

// Validate the password against the criteria
const validatePassword = (password) => {
  const errors = [];

  if (!password) {
    errors.push("Password is required.");
    return errors; // Return early if password is missing
  }

  passwordCriteria.rules.forEach(({ test, message }) => {
    if (!test(password)) {
      errors.push(message);
    }
  });

  return errors;
};

// Middleware to check password strength
const checkPasswordStrength = (req, res, next) => {
  const { password } = req.body;
  const validationErrors = validatePassword(password);

  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: "Password does not meet the required strength criteria.",
      requirements: validationErrors,
    });
  }

  next(); // Proceed to the next middleware or controller
};

module.exports = checkPasswordStrength;
