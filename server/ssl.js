/**
 * PulseCtrl Local SSL/TLS Certificate Manager
 * Generates and manages local self-signed certificates with Subject Alternative Names (SAN)
 * for localhost, 127.0.0.1, and the current LAN IP address.
 * Enables local HTTPS so mobile browsers allow microphone and speech recognition.
 */

const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');
const selfsigned = require('selfsigned');

const DEFAULT_CERTS_DIR = path.resolve(__dirname, '..', 'certs');
const DEFAULT_KEY_PATH = path.join(DEFAULT_CERTS_DIR, 'key.pem');
const DEFAULT_CERT_PATH = path.join(DEFAULT_CERTS_DIR, 'cert.pem');

/**
 * Retrieves existing SSL credentials or creates fresh ones on first run.
 * @param {string} [lanIp]
 * @param {{ keyPath?: string, certPath?: string }} [customPaths]
 * @returns {Promise<{ key: string, cert: string, keyPath: string, certPath: string }>}
 */
async function getOrCreateSslCredentials(lanIp = '', customPaths = {}) {
  const keyPath = customPaths.keyPath || process.env.SSL_KEY_PATH || DEFAULT_KEY_PATH;
  const certPath = customPaths.certPath || process.env.SSL_CERT_PATH || DEFAULT_CERT_PATH;

  // 1. Check if certificates already exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8');
      const cert = fs.readFileSync(certPath, 'utf8');

      // Verify certificate SAN covers current lanIp if lanIp is provided
      if (lanIp && lanIp !== '127.0.0.1' && !customPaths.keyPath && !process.env.SSL_KEY_PATH) {
        const x509 = new X509Certificate(cert);
        const hasLanIp = x509.subjectAltName && x509.subjectAltName.includes(lanIp);
        if (hasLanIp) {
          return { key, cert, keyPath, certPath };
        }
        console.log(`[SSL] LAN IP updated (${lanIp}). Regenerating local SSL certificate SANs...`);
      } else {
        return { key, cert, keyPath, certPath };
      }
    } catch (err) {
      console.warn('[SSL] Could not read existing certificates, regenerating:', err.message);
    }
  }

  // 2. Generate self-signed certificate with SANs
  console.log('[SSL] Generating local self-signed certificate for HTTPS...');
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' }
  ];

  if (lanIp && lanIp !== '127.0.0.1') {
    altNames.push({ type: 7, ip: lanIp });
  }

  const attrs = [
    { name: 'commonName', value: 'PulseCtrl Local' },
    { name: 'organizationName', value: 'PulseCtrl' }
  ];

  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{
      name: 'subjectAltName',
      altNames
    }]
  });

  const certsDir = path.dirname(keyPath);
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');

  console.log(`[SSL] Certificate and private key created:\n  - ${certPath}\n  - ${keyPath}`);
  return { key: pems.private, cert: pems.cert, keyPath, certPath };
}

/**
 * Synchronous read of existing SSL credentials if already present on disk.
 * @param {string} [lanIp]
 * @param {{ keyPath?: string, certPath?: string }} [customPaths]
 * @returns {{ key: string, cert: string, keyPath: string, certPath: string }|null}
 */
function getSyncSslCredentials(lanIp = '', customPaths = {}) {
  const keyPath = customPaths.keyPath || process.env.SSL_KEY_PATH || DEFAULT_KEY_PATH;
  const certPath = customPaths.certPath || process.env.SSL_CERT_PATH || DEFAULT_CERT_PATH;
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
      keyPath,
      certPath
    };
  }
  return null;
}

module.exports = {
  getOrCreateSslCredentials,
  getSyncSslCredentials,
  DEFAULT_CERTS_DIR,
  DEFAULT_KEY_PATH,
  DEFAULT_CERT_PATH
};
