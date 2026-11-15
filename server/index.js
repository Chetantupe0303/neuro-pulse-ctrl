/** Local HTTP and WebSocket server for PulseCtrl. */

const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const config = require('./config');
const { SessionManager } = require('./session');
const { validateMessage } = require('./validator');
const { getOrCreateSslCredentials, getSyncSslCredentials } = require('./ssl');
const geminiService = require('./gemini');
const aiRateLimiter = require('./aiRateLimiter');
const auditLogger = require('./auditLog');
const blocklist = require('./blocklist');
const guardian = require('./guardian');
const planner = require('./planner');
const { PlanRunner } = require('./planRunner');
const summarizer = require('./summarizer');
const visionService = require('./vision');

const DEFAULT_PORT = config.port;
const HOST = config.host;
const app = express();

const initialSslCreds = config.httpsEnabled ? getSyncSslCredentials(null, {
  keyPath: config.sslKeyPath,
  certPath: config.sslCertPath
}) : null;

const server = config.httpsEnabled
  ? https.createServer(initialSslCreds || {}, app)
  : http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
const sessionManager = new SessionManager();
let activePort = DEFAULT_PORT;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = http.createServer();
    tester.once('error', () => resolve(false));
    tester.listen(port, '127.0.0.1', () => {
      tester.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (port < startPort + 20) {
    const available = await isPortAvailable(port);
    if (available) return port;
    console.warn(`[Server] Port ${port} is occupied by another application. Checking port ${port + 1}...`);
    port++;
  }
  return startPort;
}

function getLocalIpAddress() {
  const candidates = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        candidates.push(iface.address);
      }
    }
  }
  return candidates.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    || candidates[0]
    || '127.0.0.1';
}

async function generateQrForSession(session) {
  const protocol = config.httpsEnabled ? 'https' : 'http';
  const phoneUrl = `${protocol}://${getLocalIpAddress()}:${activePort}/phone?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`;
  const qrDataUrl = await QRCode.toDataURL(phoneUrl, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
  return { phoneUrl, qrDataUrl };
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function isLoopbackAddress(address = '') {
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
}

async function publishSession(session) {
  const { phoneUrl, qrDataUrl } = await generateQrForSession(session);
  const payload = {
    sessionId: session.id, token: session.token, phoneUrl, qrDataUrl,
    approvalToken: session.approvalToken,
    status: session.status, mode: session.mode, deviceName: session.deviceName,
    os: session.os
  };
  send(session.laptopWebWs, { ...payload, type: 'session_info' });
  send(session.helperWs, { ...payload, type: 'session_ready' });
}

function createFreshSession(previous) {
  if (!previous.helperWs || previous.helperWs.readyState !== 1) return;
  const helperOs = previous.os || (previous.helperWs && previous.helperWs.os) || 'win32';
  const session = sessionManager.createSession(previous.helperWs, helperOs);
  session.helperWs.sessionId = session.id;
  session.laptopWebWs = previous.laptopWebWs;
  if (session.laptopWebWs && session.laptopWebWs.readyState === 1) {
    session.laptopWebWs.sessionId = session.id;
    session.laptopWebWs.helperWs = session.helperWs;
  }
  publishSession(session).catch((err) => console.error('[Server] Could not create QR:', err));
}

sessionManager.onSessionDisconnect = createFreshSession;

const webDir = path.join(__dirname, '..', 'web');
app.use(express.json());
app.use(express.static(webDir));
app.get('/', (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
app.get('/phone', (_req, res) => res.sendFile(path.join(webDir, 'phone.html')));
app.get('/api/info', (_req, res) => {
  const lanIp = getLocalIpAddress();
  const protocol = config.httpsEnabled ? 'https' : 'http';
  res.json({
    lanIp,
    port: activePort,
    protocol,
    localUrl: `${protocol}://localhost:${activePort}`,
    lanUrl: `${protocol}://${lanIp}:${activePort}`
  });
});
app.get('/api/health', (_req, res) => {
  let activeSession = null;
  for (const session of sessionManager.sessions.values()) {
    if (session.helperWs && session.helperWs.readyState === 1) {
      activeSession = session;
      break;
    }
  }

  res.json({
    status: 'ok',
    httpsEnabled: config.httpsEnabled,
    geminiConfigured: config.isGeminiConfigured,
    model: config.geminiModel,
    helperConnected: Boolean(activeSession),
    helperOs: activeSession ? activeSession.os : null
  });
});

app.get('/api/ai/test', (req, res) => {
  const testSession = req.query.sessionId || 'test-session';
  const rateLimitStatus = aiRateLimiter.checkLimit(testSession);
  res.json({
    geminiConfigured: config.isGeminiConfigured,
    model: config.geminiModel,
    rateLimiter: {
      maxRequests: 10,
      windowMs: 60000,
      remaining: rateLimitStatus.remaining,
      allowed: rateLimitStatus.allowed
    },
    errorCodes: Object.keys(geminiService.ErrorCodes || {
      MISSING_KEY: 'MISSING_KEY',
      RATE_LIMITED: 'RATE_LIMITED',
      TIMEOUT: 'TIMEOUT',
      INVALID_OUTPUT: 'INVALID_OUTPUT',
      API_ERROR: 'API_ERROR'
    })
  });
});

app.post('/api/ai/transcribe', async (req, res) => {
  const { audio, mimeType, sessionId } = req.body || {};
  if (!audio) {
    return res.status(400).json({ success: false, error: { message: 'Missing audio data' } });
  }
  console.log(`[Server] 🎙 Processing audio transcription request (${mimeType || 'audio/webm'})...`);
  try {
    const result = await geminiService.transcribeAudio({
      audioBase64: audio,
      mimeType: mimeType || 'audio/webm',
      sessionId: sessionId || 'http-client'
    });
    if (!result.success) {
      console.error('[Server] 🎙 Audio transcription failed:', result.error);
      return res.status(500).json(result);
    }
    console.log(`[Server] 🎙 Transcription successful: "${result.transcript}"`);
    res.json(result);
  } catch (err) {
    console.error('[Server] 🎙 Transcription error:', err);
    res.status(500).json({ success: false, error: { message: err.message || 'Transcription error' } });
  }
});

app.post('/api/ai/log-mic-error', (req, res) => {
  const err = req.body || {};
  console.error('');
  console.error('='.repeat(55));
  console.error('[Server] 🎤 MICROPHONE ERROR REPORT:');
  console.error(`  Error Name:     ${err.name || 'UnknownError'}`);
  console.error(`  Error Message:  ${err.message || '-'}`);
  console.error(`  User Friendly:  ${err.userFriendly || '-'}`);
  console.error(`  Secure Context: ${err.secureContext !== undefined ? err.secureContext : 'unknown'}`);
  console.error(`  Protocol:       ${err.protocol || '-'}`);
  console.error(`  User Agent:     ${err.userAgent || '-'}`);
  console.error('='.repeat(55));
  console.error('');
  res.json({ status: 'logged' });
});

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const role = url.searchParams.get('role');
  const sessionId = url.searchParams.get('session');
  const token = url.searchParams.get('token');
  const reconnectToken = url.searchParams.get('reconnect');

  if (role === 'helper') {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      send(ws, { type: 'error', message: 'The helper can connect only from this laptop.' });
      ws.close(4003, 'Local helper required');
      return;
    }
    const helperOs = url.searchParams.get('os') || 'win32';
    ws.os = helperOs;
    const session = sessionManager.createSession(ws, helperOs);
    ws.sessionId = session.id;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'helper_init' && msg.os) {
          ws.os = msg.os;
          session.os = msg.os;
        }
        if (msg.type === 'ai_step_ack' && session.activeRunner) {
          session.activeRunner.handleStepAck(msg);
        }
        if (msg.type === 'disconnect') sessionManager.disconnectSession(ws.sessionId, 'helper');
      } catch (_) {}
    });
    ws.on('close', () => sessionManager.disconnectSession(ws.sessionId, 'helper'));
    await publishSession(session);
    return;
  }

  if (role === 'laptop_web') {
    const session = sessionManager.validateLaptopPage(sessionId, url.searchParams.get('approval'));
    if (!session || session.status === 'disconnected') {
      send(ws, { type: 'waiting_helper', message: 'Open the laptop page from the local helper.' });
      if (sessionId && url.searchParams.has('approval')) ws.close(4001, 'Laptop page authorization failed');
      return;
    } else {
      session.laptopWebWs = ws;
      ws.sessionId = session.id;
      ws.helperWs = session.helperWs;
      await publishSession(session);
    }

    ws.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }
      let active = sessionManager.getSession(ws.sessionId);
      if (!active && msg.type === 'request_new_qr' && ws.helperWs && ws.helperWs.readyState === 1) {
        const helperOs = (ws.helperWs && ws.helperWs.os) || 'win32';
        active = sessionManager.createSession(ws.helperWs, helperOs);
        active.laptopWebWs = ws;
        ws.sessionId = active.id;
        await publishSession(active);
        return;
      }
      if (!active) return;
      if (msg.type === 'pair_response') {
        sessionManager.handleApprovalResponse(active.id, msg.allow === true);
      } else if (msg.type === 'step_confirmation_response' && active.activeRunner) {
        active.activeRunner.handleConfirmResponse(msg);
        const entry = auditLogger.log(active.id, {
          type: msg.allow ? 'step_confirmed' : 'step_denied',
          tool: 'owner_decision',
          description: msg.allow ? 'Owner allowed action' : (msg.autoDenied ? 'Action auto-denied (30s timeout)' : 'Owner denied action'),
          risk: msg.allow ? 'confirm' : 'blocked',
          decision: msg.allow ? 'allowed' : (msg.autoDenied ? 'auto_denied' : 'denied'),
          reason: msg.autoDenied ? 'Countdown expired' : 'Owner decision'
        });
        send(active.laptopWebWs, { type: 'audit_log_entry', entry });
      } else if (msg.type === 'request_session_summary') {
        const summary = await summarizer.generate(active.id);
        send(ws, { type: 'session_summary_response', summary });
      } else if (msg.type === 'set_screen_vision') {
        visionService.setOptIn(active.id, msg.enabled === true);
        const entry = auditLogger.log(active.id, {
          type: 'vision_setting',
          tool: 'screen_vision',
          description: msg.enabled ? 'AI Screen Vision enabled by owner' : 'AI Screen Vision disabled by owner',
          risk: 'confirm',
          decision: msg.enabled ? 'allowed' : 'denied'
        });
        send(active.laptopWebWs, { type: 'audit_log_entry', entry });
      } else if (msg.type === 'disconnect' || msg.type === 'request_new_qr') {
        sessionManager.disconnectSession(active.id, 'laptop');
      }
    });

    ws.on('close', () => {
      const active = sessionManager.getSession(ws.sessionId);
      if (active && active.laptopWebWs === ws) active.laptopWebWs = null;
    });
    return;
  }

  if (role === 'phone') {
    let session;
    if (reconnectToken) {
      const result = sessionManager.validatePhoneReconnect(sessionId, reconnectToken);
      if (!result.valid) {
        send(ws, { type: 'expired', message: result.error });
        ws.close(4002, 'Reconnection expired');
        return;
      }
      session = result.session;
      if (session.phoneWs) {
        send(ws, { type: 'error', message: 'A phone is already connected to this session.' });
        ws.close(4001, 'Phone already connected');
        return;
      }
      sessionManager.resumePhoneConnection(session, ws);
    } else {
      const result = sessionManager.validatePhoneJoin(sessionId, token);
      if (!result.valid) {
        send(ws, { type: 'error', code: 'PAIRING_FAILED', message: result.error });
        ws.close(4001, result.error);
        return;
      }
      session = result.session;
      sessionManager.requestPhoneApproval(session.id, ws, req.headers['user-agent'] || '');
    }
    bindPhoneEventHandlers(ws, session);
    return;
  }

  send(ws, { type: 'error', message: 'Unknown connection role' });
  ws.close(4000, 'Unknown role');
});

function bindPhoneEventHandlers(ws, session) {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (_) { return; }
    if (session.status !== 'connected' || session.phoneWs !== ws) return;
    const result = validateMessage(msg, session.mode);
    if (!result.valid) return;
    session.touch((id, reason) => sessionManager.expireSession(id, reason));
    if (!session.rateLimiter.allow()) return;
    const event = result.sanitized;
    if (event.type === 'disconnect') {
      sessionManager.disconnectSession(session.id, 'phone');
    } else if (event.type === 'mode') {
      session.mode = event.value;
      send(session.laptopWebWs, { type: 'mode', value: session.mode });
      send(session.helperWs, { type: 'mode', value: session.mode });
    } else if (event.type === 'ai_stop') {
      if (session.activeRunner) {
        session.activeRunner.stop('Stopped by phone user');
      }
    } else if (event.type === 'ai_command') {
      (async () => {
        // 1. Blocklist pre-check
        const cmdCheck = blocklist.checkCommand(event.command);
        if (cmdCheck.blocked) {
          const entry = auditLogger.log(session.id, {
            type: 'step_blocked',
            tool: '-',
            description: event.command,
            risk: 'blocked',
            decision: 'blocked',
            reason: cmdCheck.reason
          });
          send(session.laptopWebWs, { type: 'audit_log_entry', entry });
          send(ws, {
            type: 'ai_plan_error',
            error: { code: 'BLOCKED', message: cmdCheck.reason }
          });
          return;
        }

        // 2. Plan generation via Gemini
        const planResult = await planner.plan(event.command, {
          os: session.os || 'win32',
          sessionId: session.id
        });

        if (!planResult.success) {
          send(ws, {
            type: 'ai_plan_error',
            error: planResult.error
          });
          return;
        }

        // 3. AI Guardian inspection
        const guardianResult = await guardian.inspectPlan(planResult.plan, {
          sessionId: session.id
        });

        // Publish plan to phone and laptop
        send(ws, { type: 'ai_plan', plan: guardianResult.plan });
        send(session.laptopWebWs, {
          type: 'ai_plan_preview',
          plan: guardianResult.plan,
          command: event.command
        });

        const planLog = auditLogger.log(session.id, {
          type: 'plan_created',
          tool: 'planner',
          description: guardianResult.plan.summary,
          risk: guardianResult.hasBlocked ? 'blocked' : (guardianResult.hasConfirm ? 'confirm' : 'safe'),
          decision: 'executed',
          reason: `Generated ${guardianResult.plan.steps.length} steps`
        });
        send(session.laptopWebWs, { type: 'audit_log_entry', entry: planLog });

        // If any step was blocked, do not auto-run
        if (guardianResult.hasBlocked) {
          send(ws, {
            type: 'ai_execution_stopped',
            reason: 'Plan contains blocked steps'
          });
          return;
        }

        if (guardianResult.plan.steps.length === 0) {
          return;
        }

        // 4. Execute plan step by step
        const runner = new PlanRunner({
          session,
          onProgress: (prog) => {
            send(ws, { type: 'ai_execution_progress', ...prog });
            send(session.laptopWebWs, { type: 'ai_execution_progress', ...prog });
            const stepEntry = auditLogger.log(session.id, {
              type: 'step_executed',
              tool: prog.step.tool,
              description: prog.step.description,
              risk: prog.step.risk || 'safe',
              decision: 'executed',
              stepIndex: prog.currentStep,
              totalSteps: prog.totalSteps
            });
            send(session.laptopWebWs, { type: 'audit_log_entry', entry: stepEntry });
          },
          onDone: (done) => {
            send(ws, { type: 'ai_execution_done', ...done });
            send(session.laptopWebWs, { type: 'ai_execution_done', ...done });
            session.activeRunner = null;
          },
          onStopped: (stopped) => {
            send(ws, { type: 'ai_execution_stopped', ...stopped });
            send(session.laptopWebWs, { type: 'ai_execution_stopped', ...stopped });
            session.activeRunner = null;
          },
          requestConfirmation: (step) => {
            send(session.laptopWebWs, {
              type: 'confirm_step_request',
              stepId: step.id,
              step
            });
          },
          sendToHelper: (msg) => {
            send(session.helperWs, msg);
          }
        });

        session.activeRunner = runner;
        await runner.execute(guardianResult.plan);
      })().catch((err) => {
        console.error('[Server] AI execution error:', err);
        send(ws, { type: 'ai_plan_error', error: { message: err.message } });
      });
    } else if (event.type === 'ai_transcribe_audio') {
      (async () => {
        try {
          console.log(`[Server] 🎙 Received audio from phone (${session.id}) for transcription (${event.mimeType || 'audio/webm'}, base64 len: ${event.audio.length})...`);
          const result = await geminiService.transcribeAudio({
            audioBase64: event.audio,
            mimeType: event.mimeType || 'audio/webm',
            sessionId: session.id
          });
          if (result.success) {
            console.log(`[Server] 🎙 Transcription for ${session.id}: "${result.transcript}"`);
            send(ws, {
              type: 'ai_transcribe_response',
              success: true,
              transcript: result.transcript
            });
          } else {
            console.error(`[Server] 🎙 Transcription failed for ${session.id}:`, result.error);
            send(ws, {
              type: 'ai_transcribe_response',
              success: false,
              error: result.error
            });
          }
        } catch (err) {
          console.error(`[Server] 🎙 Transcription exception for ${session.id}:`, err);
          send(ws, {
            type: 'ai_transcribe_response',
            success: false,
            error: { message: err.message || 'Server transcription failed' }
          });
        }
      })();
    } else if (event.type === 'mic_error') {
      const err = event.error || {};
      console.error('');
      console.error('='.repeat(55));
      console.error(`[Server] 🎤 MICROPHONE ERROR REPORT from Phone (${session.id}):`);
      console.error(`  Error Name:     ${err.name || 'UnknownError'}`);
      console.error(`  Error Message:  ${err.message || '-'}`);
      console.error(`  User Friendly:  ${err.userFriendly || '-'}`);
      console.error(`  Secure Context: ${err.secureContext !== undefined ? err.secureContext : 'unknown'}`);
      console.error(`  Protocol:       ${err.protocol || '-'}`);
      console.error(`  User Agent:     ${err.userAgent || '-'}`);
      console.error('='.repeat(55));
      console.error('');
    } else {
      send(session.helperWs, event);
    }
  });

  ws.on('close', () => {
    if (session.pendingPhoneWs === ws) session.pendingPhoneWs = null;
    if (session.phoneWs === ws) {
      session.phoneWs = null;
      setTimeout(() => {
        if (!session.phoneWs && session.status === 'connected') sessionManager.disconnectSession(session.id, 'phone');
      }, 2000);
    }
  });
}

if (config.httpsEnabled && server && typeof server.on === 'function') {
  server.on('clientError', (err, socket) => {
    if (err.code === 'ERR_SSL_HTTP_REQUEST' && !socket.destroyed) {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n' +
        '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;">' +
        '<h2>HTTPS Required</h2>' +
        '<p>Microphone access requires a secure HTTPS connection. Please open the <strong>https://</strong> link.</p>' +
        '</body></html>'
      );
    }
  });
}

if (require.main === module) {
  (async () => {
    const lanIp = getLocalIpAddress();
    activePort = await findAvailablePort(DEFAULT_PORT);

    if (config.httpsEnabled) {
      const creds = await getOrCreateSslCredentials(lanIp, {
        keyPath: config.sslKeyPath,
        certPath: config.sslCertPath
      });
      if (server.setSecureContext) {
        server.setSecureContext({ key: creds.key, cert: creds.cert });
      }
    }

    server.listen(activePort, HOST, () => {
      const protocol = config.httpsEnabled ? 'https' : 'http';
      console.log('');
      console.log('='.repeat(55));
      console.log(`  ⚡ PulseCtrl Server is running (${protocol.toUpperCase()})!`);
      console.log(`  Local:   ${protocol}://localhost:${activePort}`);
      console.log(`  Network: ${protocol}://${lanIp}:${activePort}`);
      if (!config.httpsEnabled) {
        console.warn('  ⚠️  WARNING: HTTPS is disabled! Mobile browsers require HTTPS for microphone access. Open the https:// link or set ENABLE_HTTPS=true.');
      }
      console.log('='.repeat(55));
      console.log('');

      try {
        fs.writeFileSync(
          path.join(__dirname, '..', '.pulse-config.json'),
          JSON.stringify({
            port: activePort,
            lanIp,
            protocol,
            localUrl: `${protocol}://localhost:${activePort}`,
            lanUrl: `${protocol}://${lanIp}:${activePort}`,
            updatedAt: Date.now()
          }, null, 2),
          'utf8'
        );
      } catch (_) {}
    });
  })();
}

module.exports = {
  app,
  server,
  sessionManager,
  getLocalIpAddress,
  generateQrForSession,
  config,
  getOrCreateSslCredentials,
  getSyncSslCredentials
};
