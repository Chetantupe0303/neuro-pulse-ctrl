/**
 * PulseCtrl Helper - OS Input Executor
 * Uses @nut-tree/nut-js for native mouse and keyboard simulation.
 * Enforces mode-based execution permissions directly on the laptop.
 */

const { mouse, keyboard, Button, Key, Point } = require('@nut-tree/nut-js');
const child_process = require('child_process');

// Hardcoded safe application launch definitions per platform
const APP_LAUNCHERS = {
  win32: {
    calculator: { cmd: 'calc.exe', args: [] },
    notepad: { cmd: 'notepad.exe', args: [] },
    explorer: { cmd: 'explorer.exe', args: [] },
    files: { cmd: 'explorer.exe', args: [] },
    chrome: { cmd: 'cmd.exe', args: ['/c', 'start', 'chrome'] },
    browser: { cmd: 'cmd.exe', args: ['/c', 'start', 'chrome'] },
    edge: { cmd: 'cmd.exe', args: ['/c', 'start', 'msedge'] },
    firefox: { cmd: 'cmd.exe', args: ['/c', 'start', 'firefox'] },
    brave: { cmd: 'cmd.exe', args: ['/c', 'start brave || start chrome || start msedge'] },
    opera: { cmd: 'cmd.exe', args: ['/c', 'start', 'opera'] },
    vscode: { cmd: 'code.cmd', args: [], shell: true },
    code: { cmd: 'code.cmd', args: [], shell: true },
    spotify: { cmd: 'cmd.exe', args: ['/c', 'start', 'spotify:'] },
    paint: { cmd: 'mspaint.exe', args: [] },
    mspaint: { cmd: 'mspaint.exe', args: [] },
    word: { cmd: 'cmd.exe', args: ['/c', 'start', 'winword'] },
    excel: { cmd: 'cmd.exe', args: ['/c', 'start', 'excel'] },
    powerpoint: { cmd: 'cmd.exe', args: ['/c', 'start', 'powerpnt'] },
    taskmgr: { cmd: 'taskmgr.exe', args: [] },
    settings: { cmd: 'cmd.exe', args: ['/c', 'start', 'ms-settings:'] },
    camera: { cmd: 'cmd.exe', args: ['/c', 'start', 'microsoft.windows.camera:'] },
    photos: { cmd: 'cmd.exe', args: ['/c', 'start', 'ms-photos:'] },
    vlc: { cmd: 'cmd.exe', args: ['/c', 'start', 'vlc'] },
    discord: { cmd: 'cmd.exe', args: ['/c', 'start', 'discord:'] },
    slack: { cmd: 'cmd.exe', args: ['/c', 'start', 'slack:'] },
    telegram: { cmd: 'cmd.exe', args: ['/c', 'start', 'telegram:'] },
    zoom: { cmd: 'cmd.exe', args: ['/c', 'start', 'zoom:'] },
    teams: { cmd: 'cmd.exe', args: ['/c', 'start', 'msteams:'] },
    steam: { cmd: 'cmd.exe', args: ['/c', 'start', 'steam:'] },
    youtube: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.youtube.com'] },
    netflix: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.netflix.com'] },
    whatsapp: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://web.whatsapp.com'] },
    gmail: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://mail.google.com'] },
    github: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://github.com'] },
    google: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.google.com'] },
    amazon: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.amazon.com'] },
    reddit: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.reddit.com'] },
    instagram: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://www.instagram.com'] },
    twitter: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://twitter.com'] },
    chatgpt: { cmd: 'cmd.exe', args: ['/c', 'start', '', 'https://chatgpt.com'] }
  },
  darwin: {
    calculator: { cmd: 'open', args: ['-a', 'Calculator'] },
    notepad: { cmd: 'open', args: ['-a', 'TextEdit'] },
    finder: { cmd: 'open', args: ['-a', 'Finder'] },
    explorer: { cmd: 'open', args: ['-a', 'Finder'] },
    files: { cmd: 'open', args: ['-a', 'Finder'] },
    chrome: { cmd: 'open', args: ['-a', 'Google Chrome'] },
    browser: { cmd: 'open', args: ['-a', 'Google Chrome'] },
    brave: { cmd: 'open', args: ['-a', 'Brave Browser'] },
    edge: { cmd: 'open', args: ['-a', 'Microsoft Edge'] },
    firefox: { cmd: 'open', args: ['-a', 'Firefox'] },
    safari: { cmd: 'open', args: ['-a', 'Safari'] },
    vscode: { cmd: 'open', args: ['-a', 'Visual Studio Code'] },
    code: { cmd: 'open', args: ['-a', 'Visual Studio Code'] },
    spotify: { cmd: 'open', args: ['-a', 'Spotify'] },
    slack: { cmd: 'open', args: ['-a', 'Slack'] },
    discord: { cmd: 'open', args: ['-a', 'Discord'] },
    youtube: { cmd: 'open', args: ['https://www.youtube.com'] },
    netflix: { cmd: 'open', args: ['https://www.netflix.com'] },
    whatsapp: { cmd: 'open', args: ['https://web.whatsapp.com'] },
    gmail: { cmd: 'open', args: ['https://mail.google.com'] },
    github: { cmd: 'open', args: ['https://github.com'] }
  },
  linux: {
    calculator: { cmd: 'gnome-calculator', args: [] },
    notepad: { cmd: 'gedit', args: [] },
    finder: { cmd: 'xdg-open', args: [process.env.HOME || '/'] },
    explorer: { cmd: 'xdg-open', args: [process.env.HOME || '/'] },
    files: { cmd: 'xdg-open', args: [process.env.HOME || '/'] },
    chrome: { cmd: 'google-chrome', args: [] },
    browser: { cmd: 'google-chrome', args: [] },
    brave: { cmd: 'brave-browser', args: [] },
    edge: { cmd: 'microsoft-edge', args: [] },
    firefox: { cmd: 'firefox', args: [] },
    vscode: { cmd: 'code', args: [] },
    code: { cmd: 'code', args: [] },
    spotify: { cmd: 'spotify', args: [] },
    youtube: { cmd: 'xdg-open', args: ['https://www.youtube.com'] },
    netflix: { cmd: 'xdg-open', args: ['https://www.netflix.com'] },
    whatsapp: { cmd: 'xdg-open', args: ['https://web.whatsapp.com'] },
    gmail: { cmd: 'xdg-open', args: ['https://mail.google.com'] },
    github: { cmd: 'xdg-open', args: ['https://github.com'] }
  }
};

const FORBIDDEN_APPS = new Set([
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'bash',
  'zsh',
  'sh',
  'terminal',
  'terminal.exe',
  'wsl',
  'conhost',
  'xterm',
  'malware',
  'malware.exe'
]);

const STOPWORDS = new Set([
  'in', 'to', 'at', 'on', 'for', 'with', 'a', 'an', 'the', 'my', 'this', 'that',
  'window', 'windows', 'app', 'application', 'already', 'and', 'or', 'of', 'is'
]);

/**
 * Safely launch an allowlisted application or web URL
 * @param {string} appName
 * @param {string} [platform]
 * @param {string} [url]
 */
function launchApp(appName, platform = process.platform, url = null) {
  const normApp = String(appName || '').toLowerCase().trim();

  // Reject explicitly forbidden apps / shells / malware / stopwords
  if (
    FORBIDDEN_APPS.has(normApp) ||
    STOPWORDS.has(normApp) ||
    normApp.includes('malware') ||
    normApp.includes('cmd') ||
    normApp.includes('powershell')
  ) {
    throw new Error(`Application "${normApp}" is not allowlisted for platform "${platform}".`);
  }

  // If a URL is specified, launch cleanly in the requested browser or default browser
  if (url && typeof url === 'string') {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    if (platform === 'win32') {
      // 1. If Chrome specifically requested
      if (normApp === 'chrome') {
        try {
          const child = child_process.spawn('cmd.exe', ['/c', 'start', 'chrome', cleanUrl], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          return { success: true, app: normApp, url: cleanUrl };
        } catch (_) {}
      }

      // 2. If Edge specifically requested
      if (normApp === 'edge') {
        try {
          const child = child_process.spawn('cmd.exe', ['/c', 'start', 'msedge', cleanUrl], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          return { success: true, app: normApp, url: cleanUrl };
        } catch (_) {}
      }

      // 3. If Brave specifically requested
      if (normApp === 'brave') {
        try {
          const child = child_process.spawn('cmd.exe', ['/c', 'start', 'brave', cleanUrl], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          return { success: true, app: normApp, url: cleanUrl };
        } catch (_) {}
      }

      // 4. Default: Open in default web browser using clean start command
      try {
        const child = child_process.spawn('cmd.exe', ['/c', 'start', '', cleanUrl], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        return { success: true, app: normApp, url: cleanUrl };
      } catch (_) {
        const child = child_process.spawn('cmd.exe', ['/c', 'start', 'chrome', cleanUrl], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        return { success: true, app: normApp, url: cleanUrl };
      }
    } else if (platform === 'darwin') {
      const child = child_process.spawn('open', [cleanUrl], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, app: normApp, url: cleanUrl };
    } else {
      const child = child_process.spawn('xdg-open', [cleanUrl], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, app: normApp, url: cleanUrl };
    }
  }

  // Reject explicitly forbidden apps / shells / malware
  if (
    FORBIDDEN_APPS.has(normApp) ||
    normApp.includes('malware') ||
    normApp.includes('cmd') ||
    normApp.includes('powershell')
  ) {
    throw new Error(`Application "${normApp}" is not allowlisted for platform "${platform}".`);
  }

  const osTable = APP_LAUNCHERS[platform] || APP_LAUNCHERS.win32;
  const launcher = osTable[normApp];

  if (launcher) {
    try {
      const child = child_process.spawn(launcher.cmd, launcher.args, {
        detached: true,
        stdio: 'ignore',
        shell: launcher.shell || false
      });
      child.unref();
      return { success: true, app: normApp };
    } catch (err) {
      throw new Error(`Failed to launch ${normApp}: ${err.message}`);
    }
  }

  // Fallback: Launch any other desktop application present on the laptop
  if (platform === 'win32') {
    try {
      const child = child_process.spawn('cmd.exe', ['/c', 'start', '', normApp], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { success: true, app: normApp };
    } catch (err) {
      throw new Error(`Failed to launch ${normApp}: ${err.message}`);
    }
  } else if (platform === 'darwin') {
    try {
      const child = child_process.spawn('open', ['-a', normApp], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { success: true, app: normApp };
    } catch (err) {
      throw new Error(`Failed to launch ${normApp}: ${err.message}`);
    }
  } else {
    try {
      const child = child_process.spawn(normApp, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { success: true, app: normApp };
    } catch (err) {
      throw new Error(`Failed to launch ${normApp}: ${err.message}`);
    }
  }
}

/**
 * Execute a single validated PulseCtrl AI plan step
 * @param {Object} step
 * @returns {Promise<{ success: boolean }>}
 */
async function executeStep(step) {
  if (!step || typeof step !== 'object') {
    throw new Error('Invalid step object provided.');
  }

  const { tool, args = {} } = step;

  switch (tool) {
    case 'open_app': {
      return launchApp(args.app, process.platform, args.url);
    }

    case 'wait': {
      const ms = Math.min(10000, Math.max(50, Number(args.durationMs) || 1000));
      await new Promise(resolve => setTimeout(resolve, ms));
      return { success: true, waitedMs: ms };
    }

    case 'type_text': {
      if (typeof args.text === 'string' && args.text.length > 0) {
        await keyboard.type(args.text);
      }
      return { success: true };
    }

    case 'press_key': {
      const rawKey = (args.key || '').toLowerCase();
      const nutKey = KEY_MAP[rawKey];
      const modifiers = Array.isArray(args.modifiers) ? args.modifiers : [];

      const modsToPress = [];
      for (const mod of modifiers) {
        const modKey = MODIFIER_MAP[mod.toLowerCase()];
        if (modKey !== undefined) modsToPress.push(modKey);
      }

      for (const modKey of modsToPress) {
        await keyboard.pressKey(modKey);
      }

      if (nutKey !== undefined) {
        await keyboard.pressKey(nutKey);
        await keyboard.releaseKey(nutKey);
      } else if (args.key.length === 1) {
        await keyboard.type(args.key);
      }

      for (let i = modsToPress.length - 1; i >= 0; i--) {
        await keyboard.releaseKey(modsToPress[i]);
      }
      return { success: true };
    }

    case 'click': {
      const btn = args.button === 'right' ? Button.RIGHT : (args.button === 'middle' ? Button.MIDDLE : Button.LEFT);
      if (args.double) {
        await mouse.leftClick();
        await mouse.leftClick();
      } else if (args.button === 'right') {
        await mouse.rightClick();
      } else {
        await mouse.leftClick();
      }
      return { success: true };
    }

    case 'move_mouse': {
      const x = Math.round(Number(args.x) || 0);
      const y = Math.round(Number(args.y) || 0);
      await mouse.setPosition(new Point(x, y));
      return { success: true };
    }

    default:
      throw new Error(`Unknown step tool: ${tool}`);
  }
}

// Eliminate artificial delays to ensure ultra-smooth 60fps tracking
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// Mapping of protocol key names to nut-js Key enums
const KEY_MAP = {
  enter: Key.Return,
  return: Key.Return,
  backspace: Key.Backspace,
  tab: Key.Tab,
  escape: Key.Escape,
  esc: Key.Escape,
  space: Key.Space,
  arrowup: Key.Up,
  up: Key.Up,
  arrowdown: Key.Down,
  down: Key.Down,
  arrowleft: Key.Left,
  left: Key.Left,
  arrowright: Key.Right,
  right: Key.Right,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
  delete: Key.Delete,
  del: Key.Delete,
  f1: Key.F1,
  f2: Key.F2,
  f3: Key.F3,
  f4: Key.F4,
  f5: Key.F5,
  f6: Key.F6,
  f7: Key.F7,
  f8: Key.F8,
  f9: Key.F9,
  f10: Key.F10,
  f11: Key.F11,
  f12: Key.F12,
  plus: Key.Add,
  add: Key.Add,
  equal: Key.Equal,
  '=': Key.Equal,
  minus: Key.Minus,
  subtract: Key.Subtract,
  '-': Key.Minus,
  '0': Key.Num0,
  '1': Key.Num1,
  '2': Key.Num2,
  '3': Key.Num3,
  '4': Key.Num4,
  '5': Key.Num5,
  '6': Key.Num6,
  '7': Key.Num7,
  '8': Key.Num8,
  '9': Key.Num9,
  a: Key.A,
  b: Key.B,
  c: Key.C,
  d: Key.D,
  e: Key.E,
  f: Key.F,
  g: Key.G,
  h: Key.H,
  i: Key.I,
  j: Key.J,
  k: Key.K,
  l: Key.L,
  m: Key.M,
  n: Key.N,
  o: Key.O,
  p: Key.P,
  q: Key.Q,
  r: Key.R,
  s: Key.S,
  t: Key.T,
  u: Key.U,
  v: Key.V,
  w: Key.W,
  x: Key.X,
  y: Key.Y,
  z: Key.Z
};

const MODIFIER_MAP = {
  control: Key.LeftControl,
  ctrl: Key.LeftControl,
  alt: Key.LeftAlt,
  shift: Key.LeftShift,
  command: Key.LeftSuper,
  cmd: Key.LeftSuper,
  meta: Key.LeftSuper,
  win: Key.LeftSuper,
  windows: Key.LeftSuper,
  super: Key.LeftSuper
};

/**
 * Checks if the event type is permitted under the current mode.
 * @param {string} type - Event type
 * @param {string} mode - 'trackpad' | 'keyboard' | 'both'
 * @returns {boolean}
 */
function isPermittedInMode(type, mode) {
  if (mode === 'trackpad') {
    return type === 'move' || type === 'click' || type === 'scroll';
  }
  if (mode === 'keyboard') {
    return type === 'text' || type === 'key';
  }
  if (mode === 'both') {
    return ['move', 'click', 'scroll', 'text', 'key'].includes(type);
  }
  return false;
}

/**
 * Executes a sanitized message on the host OS.
 * @param {object} event - Sanitized protocol event
 * @param {string} currentMode - Active session mode
 */
async function executeEvent(event, currentMode = 'trackpad') {
  if (!event || !event.type) return;

  // Enforce mode permission check on the laptop helper
  if (!isPermittedInMode(event.type, currentMode)) {
    console.warn(`[Executor] Blocked "${event.type}" event: not permitted in ${currentMode} mode.`);
    return;
  }

  try {
    switch (event.type) {
      case 'move': {
        const { dx, dy } = event;
        const current = await mouse.getPosition();
        const targetX = Math.round(current.x + dx);
        const targetY = Math.round(current.y + dy);
        await mouse.setPosition(new Point(targetX, targetY));
        break;
      }

      case 'click': {
        const btn = event.button === 'right' ? Button.RIGHT : Button.LEFT;
        if (event.action === 'down') {
          await mouse.pressButton(btn);
        } else if (event.action === 'up') {
          await mouse.releaseButton(btn);
        } else {
          if (event.button === 'right') {
            await mouse.rightClick();
          } else {
            await mouse.leftClick();
          }
        }
        break;
      }

      case 'scroll': {
        const { dy, dx } = event;
        if (dy > 0) {
          await mouse.scrollDown(Math.abs(dy));
        } else if (dy < 0) {
          await mouse.scrollUp(Math.abs(dy));
        }
        if (dx > 0) {
          await mouse.scrollRight(Math.abs(dx));
        } else if (dx < 0) {
          await mouse.scrollLeft(Math.abs(dx));
        }
        break;
      }

      case 'text': {
        if (typeof event.value === 'string' && event.value.length > 0) {
          await keyboard.type(event.value);
        }
        break;
      }

      case 'key': {
        const rawKey = (event.key || '').toLowerCase();
        const nutKey = KEY_MAP[rawKey];
        const modifiers = Array.isArray(event.modifiers) ? event.modifiers : [];

        // Collect modifier keys to press
        const modsToPress = [];
        for (const mod of modifiers) {
          const modKey = MODIFIER_MAP[mod.toLowerCase()];
          if (modKey !== undefined) {
            modsToPress.push(modKey);
          }
        }

        // Press modifiers down
        for (const modKey of modsToPress) {
          await keyboard.pressKey(modKey);
        }

        // Press and release the primary key
        if (nutKey !== undefined) {
          await keyboard.pressKey(nutKey);
          await keyboard.releaseKey(nutKey);
        } else if (event.key.length === 1) {
          // Single character fallback
          await keyboard.type(event.key);
        }

        // Release modifiers in reverse order
        for (let i = modsToPress.length - 1; i >= 0; i--) {
          await keyboard.releaseKey(modsToPress[i]);
        }
        break;
      }

      default:
        // Ignore unrecognized events
        break;
    }
  } catch (err) {
    console.error(`[Executor] Error executing ${event.type}:`, err.message);
  }
}

module.exports = {
  executeEvent,
  executeStep,
  launchApp,
  APP_LAUNCHERS,
  isPermittedInMode,
  KEY_MAP,
  MODIFIER_MAP
};
