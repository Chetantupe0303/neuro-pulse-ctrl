/** Local helper WebSocket client and laptop input executor. */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { executeEvent } = require('./executor');

const INPUT_TYPES = new Set(['move', 'click', 'scroll', 'text', 'key']);

function readPulseConfig() {
  try {
    const configPath = path.join(__dirname, '..', '.pulse-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function resolvePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  const cfg = readPulseConfig();
  if (cfg.port) return Number(cfg.port);
  return 3000;
}

function resolveProtocol() {
  if (process.env.ENABLE_HTTPS === 'false') return 'http';
  const cfg = readPulseConfig();
  return cfg.protocol || 'https';
}

class PulseHelperClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.currentMode = 'trackpad';
    this.currentSessionId = null;
    this.executionChain = Promise.resolve();
    this.reconnectTimer = null;
    this.isDestroyed = false;
    this.port = resolvePort();
    this.protocol = resolveProtocol();
  }

  get socketUrl() {
    const wsProto = this.protocol === 'https' ? 'wss:' : 'ws:';
    const osParam = encodeURIComponent(process.platform);
    return `${wsProto}//localhost:${this.port}/ws?role=helper&os=${osParam}`;
  }

  get httpProtocol() {
    return this.protocol === 'https' ? 'https:' : 'http:';
  }

  connect() {
    if (this.isDestroyed || this.ws) return;
    this.port = resolvePort();
    this.protocol = resolveProtocol();
    console.log(`[Helper] Connecting to local server at ${this.socketUrl}...`);
    const ws = new WebSocket(this.socketUrl, {
      rejectUnauthorized: false
    });
    this.ws = ws;
    ws.on('open', () => {
      this.emit('status', { status: 'connected' });
      try {
        ws.send(JSON.stringify({ type: 'helper_init', os: process.platform }));
      } catch (_) {}
    });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }
      this.handleMessage(msg);
    });
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null;
      this.emit('status', { status: 'disconnected' });
      if (!this.isDestroyed) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 3000);
      }
    });
    ws.on('error', (err) => console.error(`[Helper] ${err.message}`));
  }

  handleMessage(msg) {
    if (msg.type === 'session_ready') {
      this.currentSessionId = msg.sessionId;
      const session = {
        ...msg,
        webUrl: `${this.httpProtocol}//localhost:${this.port}/?session=${encodeURIComponent(msg.sessionId)}&approval=${encodeURIComponent(msg.approvalToken)}`
      };
      this.emit('session_ready', session);
    } else if (msg.type === 'paired') {
      this.currentMode = msg.mode || 'trackpad';
      this.emit('paired', msg);
    } else if (msg.type === 'mode') {
      this.currentMode = msg.value;
    } else if (msg.type === 'disconnect' || msg.type === 'expired') {
      this.emit('phone_disconnected', msg);
    } else if (INPUT_TYPES.has(msg.type)) {
      this.executionChain = this.executionChain
        .then(() => executeEvent(msg, this.currentMode))
        .catch((err) => console.error('[Helper] Input error:', err.message));
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    this.removeAllListeners();
  }
}

module.exports = { PulseHelperClient };
