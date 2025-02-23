const rateLimit = require("express-rate-limit");
const { errorResponse } = require("../utils/responseUtils");
const { customTimestamp } = require("../utils/generalUtils");
const {versionPath} = require("../../package.json");

const createLogObj = (req, res) => ({
  ip: req.headers['x-forwarded-for'] || req.ip,
  userAgent: req.header("User-Agent"),
  referrer: req.header("Referer"),
  timestamp: customTimestamp(),
  method: req.method,
  path: req.originalUrl,
  queryParams: req.query,
  contentType: req.header('Content-Type'),
  origin: req.header('Origin'),
  userId: req.user ? req.user.id : null, // Logged-in user ID
  rateLimitInfo: {
    limit: req.rateLimit ? req.rateLimit.limit : null,
    remaining: req.rateLimit ? req.rateLimit.remaining : null,
    resetTime: req.rateLimit ? customTimestamp(new Date(req.rateLimit.resetTime)) : null,
  },
});


// Generalized error handler for rate limits
const rateLimitHandler = (message) => (req, res) => {
  return errorResponse(res, message, 429, createLogObj(req));
};

// Reusable rate limiter configuration generator
const createRateLimiter = (options) => {
  const { windowMs, maxRequests, message, skip } = options;
  return rateLimit({
    windowMs,
    max: maxRequests,
    skip,
    handler: rateLimitHandler(message),
    standardHeaders: true, // Send rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  });
};

// General limiter: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => {
    // Skip global limiting for image GET requests
    return req.path.startsWith('/api/' + versionPath + '/images') && req.method === 'GET';
  },
  message: "Too many requests from this IP, please try again later.",

});

// Login limiter: 5 attempts per minute
const loginLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: "Too many login attempts, please try again in a minute.",
});

// Create a dedicated rate limiter for image GET requests
const imageGetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 500,         // Adjust this value based on your expected load
  message: "Too many image requests from this IP, please try again later.",
});

module.exports = { limiter, loginLimiter, imageGetLimiter };
