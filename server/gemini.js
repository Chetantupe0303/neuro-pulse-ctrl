/**
 * Gemini Service for PulseCtrl AI
 * Handles structured JSON generation via @google/genai, with:
 * - 15-second timeout
 * - 1 automatic retry with backoff for transient errors
 * - Strict error mapping (MISSING_KEY, RATE_LIMITED, TIMEOUT, INVALID_OUTPUT, API_ERROR)
 * - Per-session rate limiting
 */

const { GoogleGenAI } = require('@google/genai');
const config = require('./config');
const aiRateLimiter = require('./aiRateLimiter');

// Standard error codes
const ErrorCodes = {
  MISSING_KEY: 'MISSING_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  API_ERROR: 'API_ERROR'
};

class GeminiService {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.geminiApiKey;
    this.modelName = options.modelName || config.geminiModel || 'gemini-2.5-flash';
    this.timeoutMs = options.timeoutMs || 15000;
    this.rateLimiter = options.rateLimiter || aiRateLimiter;
    this.mockClient = options.mockClient || null; // For deterministic unit testing
  }

  /**
   * Normalize and map errors into standard PulseCtrl AI error structures
   */
  mapError(err) {
    if (!err) return { code: ErrorCodes.API_ERROR, message: 'Unknown error occurred.' };
    if (err.code && Object.values(ErrorCodes).includes(err.code)) {
      return { code: err.code, message: err.message };
    }

    const msg = String(err.message || err);

    if (msg.includes('429') || msg.includes('ResourceExhausted') || msg.includes('rate limit') || msg.includes('quota')) {
      return {
        code: ErrorCodes.RATE_LIMITED,
        message: 'AI rate limit or quota exceeded. Please wait a moment.'
      };
    }

    if (msg.includes('TIMEOUT') || msg.includes('timed out') || msg.includes('deadline')) {
      return {
        code: ErrorCodes.TIMEOUT,
        message: `AI request timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`
      };
    }

    if (msg.includes('JSON') || msg.includes('parse') || msg.includes('INVALID_OUTPUT') || msg.includes('Unexpected token')) {
      return {
        code: ErrorCodes.INVALID_OUTPUT,
        message: 'Failed to parse AI output as valid JSON.'
      };
    }

    if (msg.includes('API key') || msg.includes('MISSING_KEY')) {
      return {
        code: ErrorCodes.MISSING_KEY,
        message: 'Gemini API key is not configured. Set GEMINI_API_KEY in .env.'
      };
    }

    return {
      code: ErrorCodes.API_ERROR,
      message: msg
    };
  }

  /**
   * Get an initialized GoogleGenAI instance
   */
  getClient() {
    if (this.mockClient) return this.mockClient;
    if (!this.apiKey) return null;
    return new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Helper to execute an async operation with a timeout
   */
  async withTimeout(promise, ms) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`Request timed out after ${ms}ms`);
        err.code = ErrorCodes.TIMEOUT;
        reject(err);
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Generate structured JSON output with automatic retry and rate limiting
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemInstruction]
   * @param {Object} [params.responseSchema]
   * @param {string} [params.sessionId]
   * @returns {Promise<{ success: boolean, data?: any, error?: { code: string, message: string } }>}
   */
  async generateJson({ prompt, systemInstruction, responseSchema, sessionId }) {
    // 1. Check Rate Limiter
    if (sessionId) {
      const rateCheck = this.rateLimiter.checkLimit(sessionId);
      if (!rateCheck.allowed) {
        return {
          success: false,
          error: {
            code: ErrorCodes.RATE_LIMITED,
            message: `Rate limit reached. Max 10 requests/min. Retry after ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`
          }
        };
      }
    }

    // 2. Check API Key
    if (!this.apiKey && !this.mockClient) {
      return {
        success: false,
        error: this.mapError(new Error('MISSING_KEY'))
      };
    }

    // 3. Execution with 1 retry
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (sessionId) {
          this.rateLimiter.recordRequest(sessionId);
        }

        const client = this.getClient();
        const callPromise = (async () => {
          if (this.mockClient) {
            return await this.mockClient.generateContent({ prompt, systemInstruction, responseSchema });
          }

          const modelConfig = {
            responseMimeType: 'application/json'
          };
          if (systemInstruction) {
            modelConfig.systemInstruction = systemInstruction;
          }
          if (responseSchema) {
            modelConfig.responseSchema = responseSchema;
          }

          const response = await client.models.generateContent({
            model: this.modelName,
            contents: prompt,
            config: modelConfig
          });

          return response;
        })();

        const response = await this.withTimeout(callPromise, this.timeoutMs);

        // Extract raw text
        let rawText = '';
        if (typeof response === 'string') {
          rawText = response;
        } else if (response && response.text) {
          rawText = typeof response.text === 'function' ? response.text() : response.text;
        } else if (response && response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
          rawText = response.candidates[0].content.parts[0].text;
        }

        // Clean any accidental markdown code fences
        let cleaned = rawText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();

        try {
          const parsed = JSON.parse(cleaned);
          return {
            success: true,
            data: parsed
          };
        } catch (jsonErr) {
          const parseErr = new Error('INVALID_OUTPUT: ' + jsonErr.message);
          parseErr.code = ErrorCodes.INVALID_OUTPUT;
          throw parseErr;
        }
      } catch (err) {
        lastError = err;
        // Don't retry on client errors or missing keys
        if (err.code === ErrorCodes.MISSING_KEY || err.code === ErrorCodes.INVALID_OUTPUT) {
          break;
        }
        // Brief backoff before retry attempt 2
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
    }

    return {
      success: false,
      error: this.mapError(lastError)
    };
  }
}

module.exports = new GeminiService();
module.exports.GeminiService = GeminiService;
module.exports.ErrorCodes = ErrorCodes;
