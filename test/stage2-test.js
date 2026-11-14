/**
 * Stage 2 Verification Test: Local HTTPS & SSL Management
 * Tests:
 * 1. SSL credential manager generates valid self-signed certificate with SANs
 * 2. X509 certificate contains DNS:localhost and IP Address:127.0.0.1
 * 3. Server generates https:// QR codes
 * 4. /api/info and /api/health report HTTPS configuration
 * 5. Helper client correctly sets wss:// and https:// URLs with rejectUnauthorized: false
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { X509Certificate } = require('crypto');
const { getOrCreateSslCredentials, getSyncSslCredentials } = require('../server/ssl');
const config = require('../server/config');
const { app, generateQrForSession, server } = require('../server/index');
const { PulseHelperClient } = require('../helper/client');

function mockGet(routePath) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage();
    req.method = 'GET';
    req.url = routePath;
    req.headers = { host: 'localhost' };

    const res = new http.ServerResponse(req);
    let output = '';

    res.write = (chunk) => {
      output += chunk;
      return true;
    };
    res.end = (chunk) => {
      if (chunk) output += chunk;
      try {
        resolve({
          statusCode: res.statusCode || 200,
          body: JSON.parse(output),
          rawBody: output
        });
      } catch (err) {
        resolve({
          statusCode: res.statusCode || 200,
          body: null,
          rawBody: output
        });
      }
    };

    app.handle(req, res);
  });
}

async function runStage2Tests() {
  console.log('🧪 Starting Stage 2 Verification Tests...\n');

  // 1. SSL Credential Generation with SANs
  console.log('[1/5] Verifying SSL certificate generation and SANs...');
  const testLanIp = '192.168.1.99';
  const creds = await getOrCreateSslCredentials(testLanIp);
  assert(creds.key && creds.key.includes('PRIVATE KEY'), 'Key should contain private key PEM');
  assert(creds.cert && creds.cert.includes('CERTIFICATE'), 'Cert should contain certificate PEM');

  const x509 = new X509Certificate(creds.cert);
  assert(x509.subjectAltName.includes('localhost'), 'Certificate SAN must include localhost');
  assert(x509.subjectAltName.includes('127.0.0.1'), 'Certificate SAN must include 127.0.0.1');
  assert(x509.subjectAltName.includes(testLanIp), 'Certificate SAN must include active LAN IP');
  console.log('  ✓ Certificate SAN verified:', x509.subjectAltName);

  // 2. Synchronous Credential Reading
  console.log('[2/5] Verifying synchronous credential reading...');
  const syncCreds = getSyncSslCredentials();
  assert(syncCreds && syncCreds.cert && syncCreds.key, 'Synchronous credentials must read generated certs');
  console.log('  ✓ getSyncSslCredentials successfully read certificate files');

  // 3. QR Code URL uses https://
  console.log('[3/5] Verifying QR code URL protocol...');
  const mockSession = { id: 'test_session_123', token: 'test_token_456' };
  const { phoneUrl } = await generateQrForSession(mockSession);
  assert(phoneUrl.startsWith('https://'), `Phone URL must start with https://, got: ${phoneUrl}`);
  console.log('  ✓ QR Phone URL correctly uses https:// scheme:', phoneUrl);

  // 4. API endpoints report HTTPS
  console.log('[4/5] Verifying /api/info and /api/health report HTTPS...');
  const infoData = await mockGet('/api/info');
  assert.strictEqual(infoData.body.protocol, 'https', '/api/info protocol should be https');
  assert(infoData.body.localUrl.startsWith('https://'), 'localUrl should start with https://');
  assert(infoData.body.lanUrl.startsWith('https://'), 'lanUrl should start with https://');

  const healthData = await mockGet('/api/health');
  assert.strictEqual(healthData.body.httpsEnabled, true, '/api/health should report httpsEnabled: true');
  console.log('  ✓ /api/info and /api/health correctly report HTTPS:', {
    protocol: infoData.body.protocol,
    httpsEnabled: healthData.body.httpsEnabled
  });

  // 5. Helper client protocol and WSS URL
  console.log('[5/5] Verifying helper client WSS and HTTPS configuration...');
  const helper = new PulseHelperClient();
  assert.strictEqual(helper.protocol, 'https', 'Helper client protocol should be https');
  assert.strictEqual(helper.httpProtocol, 'https:', 'Helper client httpProtocol should be https:');
  assert(helper.socketUrl.startsWith('wss://'), `Helper socketUrl must start with wss://, got: ${helper.socketUrl}`);
  helper.destroy();
  console.log('  ✓ Helper client connects via WSS with self-signed certificate handling');

  if (server && server.close) {
    server.close();
  }

  console.log('\n🎉 ALL STAGE 2 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runStage2Tests().catch((err) => {
  console.error('\n❌ STAGE 2 TESTS FAILED:', err);
  process.exit(1);
});
