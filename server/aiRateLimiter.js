/**
 * Per-Session AI Rate Limiter
 * Implements a sliding window rate limiter: max 10 requests per minute per session.
 */

class AiRateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10;
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute
    this.sessions = new Map(); // sessionId -> Array of timestamps
  }

  /**
   * Check whether a session is allowed to make a request
   * @param {string} sessionId
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  checkLimit(sessionId) {
    if (!sessionId) {
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs };
    }

    const now = Date.now();
    const timestamps = this.sessions.get(sessionId) || [];
    
    // Filter timestamps within the sliding window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    this.sessions.set(sessionId, validTimestamps);

    if (validTimestamps.length >= this.maxRequests) {
      const oldestInWindow = validTimestamps[0];
      const retryAfterMs = Math.max(0, this.windowMs - (now - oldestInWindow));
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs
      };
    }

    return {
      allowed: true,
      remaining: this.maxRequests - validTimestamps.length,
      retryAfterMs: 0
    };
  }

  /**
   * Record an approved request
   * @param {string} sessionId
   * @returns {boolean} whether request was recorded
   */
  recordRequest(sessionId) {
    const check = this.checkLimit(sessionId);
    if (!check.allowed) return false;

    const timestamps = this.sessions.get(sessionId) || [];
    timestamps.push(Date.now());
    this.sessions.set(sessionId, timestamps);
    return true;
  }

  /**
   * Reset rate limit state for a session
   * @param {string} sessionId
   */
  resetSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions
   */
  clearAll() {
    this.sessions.clear();
  }
}

module.exports = new AiRateLimiter();
module.exports.AiRateLimiter = AiRateLimiter;
