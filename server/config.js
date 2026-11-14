/**
 * PulseCtrl Server Configuration
 * Loads environment variables from .env and exposes validated settings.
 * Never exposes the raw API key to unauthorized endpoints or clients.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Check for .env in project root, then server directory
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const serverEnvPath = path.resolve(__dirname, '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else {
  dotenv.config(); // Fallback default search
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  get isGeminiConfigured() {
    return Boolean(this.geminiApiKey && this.geminiApiKey.trim().length > 0);
  },
  httpsEnabled: process.env.ENABLE_HTTPS !== 'false',
  sslKeyPath: process.env.SSL_KEY_PATH || '',
  sslCertPath: process.env.SSL_CERT_PATH || ''
};

module.exports = config;
