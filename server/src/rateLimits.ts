import rateLimit from "express-rate-limit";

// the auth middleware stores the logged-in user's id on req.userId
const userKey = (req: unknown) => (req as { userId?: string }).userId ?? "anonymous";

// general safety net, per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

// brute-force protection for login/register: only failed attempts count
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, try again in 15 minutes" },
});

// endpoints that call the embedding API, per user
export const embedLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many search/save requests, wait a minute" },
});

// the AI reviewer is the most expensive endpoint, per user
export const reviewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI reviews, try again in a few minutes" },
});