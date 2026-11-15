/**
 * PulseCtrl - Phone Client Controller
 * Clean, minimal, utility-focused wireless trackpad & keyboard engine.
 * Supports automated session recovery, seamless reconnection, and 2 operational modes.
 */

(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');
  const token = urlParams.get('token');

  // UI elements
  const statusPill = document.getElementById('phoneStatusPill');
  const statusText = document.getElementById('phoneStatusText');
  const disconnectBtn = document.getElementById('phoneDisconnectBtn');
  const overlayScreen = document.getElementById('overlayScreen');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const btnOverlayAction = document.getElementById('btnOverlayAction');

  // Mode panels & bottom tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const bottomTabItems = document.querySelectorAll('.bottom-tab-item');
  const panelTrackpad = document.getElementById('panelTrackpad');
  const panelKeyboard = document.getElementById('panelKeyboard');
  const panelBoth = document.getElementById('panelBoth');
  const panelAi = document.getElementById('panelAi');
  const panels = {
    trackpad: panelTrackpad,
    keyboard: panelKeyboard,
    both: panelBoth,
    ai: panelAi
  };

  // Typing elements
  const bothTextInput = document.getElementById('bothTextInput');
  const btnBothSend = document.getElementById('btnBothSend');
  const btnBothBackspace = document.getElementById('btnBothBackspace');
  const keyboardTextInput = document.getElementById('keyboardTextInput');
  const btnKeyboardSend = document.getElementById('btnKeyboardSend');
  const btnKeyboardBackspace = document.getElementById('btnKeyboardBackspace');

  let ws = null;
  let isPaired = false;
  let currentMode = 'trackpad';
  let currentTab = 'trackpad';
  let reconnectAttempts = 0;
  let isExplicitDisconnect = false;
  let terminalState = false;

  // Active modifier keys (Ctrl, Alt, Shift)
  const activeModifiers = new Set();

  // Storage key for seamless session resumption
  const STORAGE_KEY = 'pulse_reconnect_session';

  // Haptic feedback engine (navigator.vibrate)
  function triggerHaptic(type = 'light') {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        switch (type) {
          case 'light':
            navigator.vibrate(10);
            break;
          case 'medium':
            navigator.vibrate(20);
            break;
          case 'heavy':
            navigator.vibrate([30, 20, 30]);
            break;
          case 'error':
            navigator.vibrate([50, 40, 50]);
            break;
          default:
            navigator.vibrate(15);
        }
      } catch (_) {}
    }
  }

  function setStatus(state, text) {
    statusPill.className = 'status-pill status-' + state;
    statusText.textContent = text;
  }

  function showOverlay(title, desc, showAction = false, actionText = 'Reconnect') {
    overlayTitle.textContent = title;
    overlayDesc.textContent = desc;
    overlayScreen.classList.remove('hidden');

    if (showAction && btnOverlayAction) {
      btnOverlayAction.style.display = 'inline-block';
      btnOverlayAction.textContent = actionText;
    } else if (btnOverlayAction) {
      btnOverlayAction.style.display = 'none';
    }
  }

  function hideOverlay() {
    overlayScreen.classList.add('hidden');
    if (btnOverlayAction) {
      btnOverlayAction.style.display = 'none';
    }
  }

  // Retrieve any stored reconnect token
  function getSavedReconnectData() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveReconnectData(reconnectToken) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId,
        reconnectToken,
        savedAt: Date.now()
      }));
    } catch (_) {}
  }

  function clearReconnectData() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  if (!sessionId && !getSavedReconnectData()?.sessionId) {
    showOverlay('Scan QR Code', 'Open the laptop page and scan the QR code to connect.', false);
    setStatus('disconnected', 'Scan QR');
    return;
  }

  // WebSocket Connection & Reconnection Engine
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const saved = getSavedReconnectData();
    let wsUrl = '';

    // If we have a saved reconnect token for this session, use seamless reconnection
    if (saved && saved.sessionId === sessionId && saved.reconnectToken && !isExplicitDisconnect) {
      wsUrl = `${protocol}//${window.location.host}/ws?role=phone&session=${encodeURIComponent(saved.sessionId)}&reconnect=${encodeURIComponent(saved.reconnectToken)}`;
      showOverlay('Reconnecting...', 'Resuming session...');
      setStatus('waiting', 'Reconnecting');
    } else if (sessionId && token) {
      wsUrl = `${protocol}//${window.location.host}/ws?role=phone&session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
      showOverlay('Connecting...', 'Contacting laptop...');
      setStatus('waiting', 'Connecting');
    } else {
      showOverlay('Session Ended', 'Please scan the new QR code on your laptop screen.', false);
      setStatus('disconnected', 'Scan QR');
      return;
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reconnectAttempts = 0;
      if (!saved || !saved.reconnectToken) {
        showOverlay('Waiting for Approval', 'Please click "Allow" on your laptop screen.');
        setStatus('waiting', 'Awaiting approval');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'waiting_approval') {
          terminalState = false;
          showOverlay('Waiting for Approval', 'Please click "Allow" on your laptop screen.', false);
          setStatus('waiting', 'Awaiting approval');
        } else if (msg.type === 'paired') {
          isPaired = true;
          isExplicitDisconnect = false;
          terminalState = false;
          hideOverlay();
          setStatus('connected', 'Connected');

          if (msg.reconnectToken) {
            saveReconnectData(msg.reconnectToken);
          }

          if (msg.mode) {
            setMode(msg.mode === 'both' ? 'both' : 'trackpad', false);
          }
        } else if (msg.type === 'denied') {
          isPaired = false;
          terminalState = true;
          clearReconnectData();
          showOverlay('Connection Denied', 'The laptop denied connection. Please scan the QR code again.', false);
          setStatus('disconnected', 'Denied');
        } else if (msg.type === 'status' && msg.status === 'disconnected') {
          isPaired = false;
          terminalState = true;
          clearReconnectData();
          showOverlay('Disconnected', 'Connection ended. Scan the new QR code on your laptop to connect again.', false);
          setStatus('disconnected', 'Disconnected');
        } else if (msg.type === 'expired') {
          isPaired = false;
          terminalState = true;
          clearReconnectData();
          showOverlay('Session Expired', 'Session timed out. Scan the new QR code on your laptop to connect again.', false);
          setStatus('disconnected', 'Expired');
        } else if (msg.type === 'error') {
          isPaired = false;
          terminalState = true;
          clearReconnectData();
          showOverlay('Connection Error', msg.message || 'Unable to connect. Scan the new QR code on your laptop.', false);
          setStatus('disconnected', 'Error');
        } else if (msg.type === 'mode') {
          setTab(msg.value || 'trackpad', false);
        } else if (msg.type === 'ai_plan') {
          handleAiPlan(msg.plan);
        } else if (msg.type === 'ai_plan_error') {
          const errMsg = msg.error && msg.error.message ? msg.error.message : 'Planning failed';
          setTraceState('blocked', errMsg);
          if (aiSpeechMsg) aiSpeechMsg.textContent = errMsg;
          triggerHaptic('error');
        } else if (msg.type === 'ai_execution_progress') {
          handleExecutionProgress(msg);
        } else if (msg.type === 'ai_execution_done') {
          setTraceState('done', 'All actions completed');
          if (aiSpeechMsg) aiSpeechMsg.textContent = 'Execution finished successfully.';
          if (btnAiStop) btnAiStop.style.display = 'none';
          triggerHaptic('medium');
        } else if (msg.type === 'ai_execution_stopped') {
          setTraceState('blocked', msg.reason || 'Execution stopped');
          if (aiSpeechMsg) aiSpeechMsg.textContent = msg.reason || 'Actions stopped.';
          if (btnAiStop) btnAiStop.style.display = 'none';
          triggerHaptic('error');
        } else if (msg.type === 'ai_transcribe_response') {
          handleTranscribeResponse(msg);
        }
      } catch (e) {
        console.error('[Phone] Parse error:', e);
      }
    };

    ws.onclose = () => {
      const hadSession = isPaired;
      isPaired = false;

      // Do not overwrite explicit terminal messages
      if (terminalState) {
        return;
      }

      if (isExplicitDisconnect) {
        clearReconnectData();
        showOverlay('Disconnected', 'You disconnected from the laptop. Scan the new QR code to connect again.', false);
        setStatus('disconnected', 'Disconnected');
        return;
      }

      // If unexpected disconnect (e.g. mobile lock or Wi-Fi blip), attempt auto-reconnect
      if (hadSession && reconnectAttempts < 5) {
        reconnectAttempts++;
        showOverlay('Reconnecting...', `Reconnecting (attempt ${reconnectAttempts}/5)...`);
        setStatus('waiting', 'Reconnecting');
        setTimeout(connect, 1500);
      } else {
        clearReconnectData();
        showOverlay('Disconnected', 'Connection lost. Scan the new QR code on your laptop to connect again.', false);
        setStatus('disconnected', 'Disconnected');
      }
    };

    ws.onerror = (err) => {
      console.error('[Phone] WebSocket error:', err);
    };
  }

  // Safe message dispatch helper
  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN && isPaired) {
      ws.send(JSON.stringify(data));
    }
  }

  // Disconnect button
  disconnectBtn.addEventListener('click', () => {
    triggerHaptic('heavy');
    isExplicitDisconnect = true;
    terminalState = true;
    clearReconnectData();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }));
      try { ws.close(1000, 'User disconnect'); } catch (_) {}
    }
    showOverlay('Disconnected', 'You disconnected from the laptop. Scan the new QR code to connect again.', false);
    setStatus('disconnected', 'Disconnected');
  });

  if (btnOverlayAction) {
    btnOverlayAction.addEventListener('click', () => {
      triggerHaptic('medium');
      isExplicitDisconnect = false;
      connect();
    });
  }

  // 4-Tab switching (Trackpad, Keyboard, Both, AI)
  function setTab(tabId, notifyServer = true) {
    if (!tabId || !panels[tabId]) return;
    currentTab = tabId;

    bottomTabItems.forEach(item => {
      if (item.dataset.tab === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    tabButtons.forEach(btn => {
      if (btn.dataset.mode === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    Object.keys(panels).forEach(key => {
      if (panels[key]) {
        if (key === tabId) {
          panels[key].classList.add('active');
        } else {
          panels[key].classList.remove('active');
        }
      }
    });

    // Notify server of mode change for supported physical input modes
    if (['trackpad', 'keyboard', 'both'].includes(tabId)) {
      currentMode = tabId;
      if (notifyServer) {
        send({ type: 'mode', value: currentMode });
      }
    }
  }

  function setMode(mode, notifyServer = true) {
    setTab(mode, notifyServer);
  }

  bottomTabItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      if (tabId && tabId !== currentTab) {
        triggerHaptic('light');
        setTab(tabId, true);
      }
    });
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode && mode !== currentTab) {
        triggerHaptic('light');
        setTab(mode, true);
      }
    });
  });

  // -------------------------------------------------------------
  // SENSITIVITY, TOOLS & WINDOW MANAGEMENT
  // -------------------------------------------------------------
  let mouseSensitivity = 100;
  try {
    const savedSens = localStorage.getItem('pulse_mouse_sensitivity');
    if (savedSens) {
      mouseSensitivity = Math.max(20, Math.min(300, parseInt(savedSens, 10)));
    }
  } catch (_) {}

  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityDisplay = document.getElementById('sensitivityDisplay');
  const headerSensLabel = document.getElementById('headerSensLabel');

  function updateSensitivity(val) {
    mouseSensitivity = Math.max(20, Math.min(300, parseInt(val, 10)));
    if (sensitivitySlider) sensitivitySlider.value = mouseSensitivity;
    if (sensitivityDisplay) sensitivityDisplay.textContent = mouseSensitivity + '%';
    if (headerSensLabel) headerSensLabel.textContent = mouseSensitivity + '%';
    try {
      localStorage.setItem('pulse_mouse_sensitivity', mouseSensitivity.toString());
    } catch (_) {}
  }

  if (sensitivitySlider) {
    sensitivitySlider.value = mouseSensitivity;
    if (sensitivityDisplay) sensitivityDisplay.textContent = mouseSensitivity + '%';
    if (headerSensLabel) headerSensLabel.textContent = mouseSensitivity + '%';
    sensitivitySlider.addEventListener('input', (e) => {
      updateSensitivity(e.target.value);
    });
  }

  // Toggle Windows & Navigation Drawer
  const btnToggleTools = document.getElementById('btnToggleTools');
  const quickToolbar = document.getElementById('quickToolbar');
  const navDrawer = document.getElementById('navDrawer');
  if (btnToggleTools) {
    btnToggleTools.addEventListener('click', () => {
      triggerHaptic('light');
      const isHidden = !quickToolbar || quickToolbar.style.display === 'none';
      if (quickToolbar) quickToolbar.style.display = isHidden ? 'block' : 'none';
      if (navDrawer) navDrawer.style.display = isHidden ? 'block' : 'none';
      btnToggleTools.classList.toggle('active', isHidden);
    });
  }

  // Quick Zoom buttons
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      triggerHaptic('light');
      send({ type: 'key', key: '=', modifiers: ['control'] });
    });
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      triggerHaptic('light');
      send({ type: 'key', key: '-', modifiers: ['control'] });
    });
  }

  // Navigation & Window Management Key Action mappings
  const NAV_KEY_ACTIONS = {
    'alt-tab': { key: 'Tab', modifiers: ['alt'] },
    'desktop': { key: 'd', modifiers: ['win'] },
    'maximize': { key: 'ArrowUp', modifiers: ['win'] },
    'minimize': { key: 'ArrowDown', modifiers: ['win'] },
    'snap-left': { key: 'ArrowLeft', modifiers: ['win'] },
    'snap-right': { key: 'ArrowRight', modifiers: ['win'] },
    'close-win': { key: 'F4', modifiers: ['alt'] },
    'back': { key: 'ArrowLeft', modifiers: ['alt'] },
    'forward': { key: 'ArrowRight', modifiers: ['alt'] },
    'refresh': { key: 'F5', modifiers: [] },
    'new-tab': { key: 't', modifiers: ['control'] }
  };

  document.querySelectorAll('.btn-nav-action[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionName = btn.dataset.nav;
      const mapping = NAV_KEY_ACTIONS[actionName];
      if (mapping) {
        send({
          type: 'key',
          key: mapping.key,
          modifiers: mapping.modifiers
        });
      }
    });
  });

  // Clicking & Dragging Lock state
  let isDragLocked = false;
  const btnDragToggle = document.getElementById('btnDragToggle');
  const btnDragToggleBoth = document.getElementById('btnDragToggleBoth');

  function setDragLock(locked) {
    isDragLocked = locked;
    const text = locked ? '✋ Drag: ON' : '✋ Drag: OFF';
    const textBoth = locked ? '✋ Dragging' : '✋ Drag';
    if (btnDragToggle) {
      btnDragToggle.textContent = text;
      btnDragToggle.classList.toggle('active', locked);
    }
    if (btnDragToggleBoth) {
      btnDragToggleBoth.textContent = textBoth;
      btnDragToggleBoth.classList.toggle('active', locked);
    }
    send({
      type: 'click',
      button: 'left',
      action: locked ? 'down' : 'up'
    });
  }

  function toggleDragLock() {
    setDragLock(!isDragLocked);
  }

  if (btnDragToggle) btnDragToggle.addEventListener('click', toggleDragLock);
  if (btnDragToggleBoth) btnDragToggleBoth.addEventListener('click', toggleDragLock);

  // -------------------------------------------------------------
  // MOUSEPAD ENGINE (Sensitivity, Dragging, Scrolling & Zooming)
  // -------------------------------------------------------------
  function setupTrackpadSurface(element) {
    if (!element) return;

    let touchStartTime = 0;
    let maxTouchCount = 0;
    let lastX = 0;
    let lastY = 0;
    let initialTouchX = 0;
    let initialTouchY = 0;
    let lastScrollY = 0;
    let lastScrollX = 0;
    let hasMoved = false;

    // Double-tap & hold drag state
    let lastTapEndTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let isDoubleTapDrag = false;

    // Pinch-to-zoom state
    let initialPinchDist = 0;
    let lastZoomTime = 0;

    let pendingDx = 0;
    let pendingDy = 0;
    let pendingScrollDy = 0;
    let pendingScrollDx = 0;
    let lastSendTime = 0;

    function flushDeltas() {
      if (pendingDx !== 0 || pendingDy !== 0) {
        send({
          type: 'move',
          dx: Math.round(pendingDx),
          dy: Math.round(pendingDy)
        });
        pendingDx = 0;
        pendingDy = 0;
      }

      if (pendingScrollDy !== 0 || pendingScrollDx !== 0) {
        send({
          type: 'scroll',
          dy: Math.round(pendingScrollDy),
          dx: Math.round(pendingScrollDx)
        });
        pendingScrollDy = 0;
        pendingScrollDx = 0;
      }
    }

    function checkThrottle() {
      const now = performance.now();
      if (now - lastSendTime >= 15) { // ~60 FPS
        lastSendTime = now;
        flushDeltas();
      }
    }

    element.addEventListener('touchstart', (e) => {
      maxTouchCount = Math.max(maxTouchCount, e.touches.length);
      touchStartTime = Date.now();
      hasMoved = false;

      if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        initialTouchX = lastX;
        initialTouchY = lastY;

        // Check for double-tap and hold (start drag gesture)
        const timeSinceLastTap = touchStartTime - lastTapEndTime;
        const distFromLastTap = Math.hypot(lastX - lastTapX, lastY - lastTapY);
        if (timeSinceLastTap < 300 && distFromLastTap < 35 && !isDragLocked) {
          isDoubleTapDrag = true;
          send({ type: 'click', button: 'left', action: 'down' });
        }
      } else if (e.touches.length === 2) {
        lastScrollX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: false });

    element.addEventListener('touchmove', (e) => {
      e.preventDefault(); // Stop native scrolling & bounce
      maxTouchCount = Math.max(maxTouchCount, e.touches.length);

      if (e.touches.length === 1) {
        // 1-finger mouse movement (with percentage sensitivity scaling)
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;

        const dx = currentX - lastX;
        const dy = currentY - lastY;

        lastX = currentX;
        lastY = currentY;

        if (Math.abs(currentX - initialTouchX) > 4 || Math.abs(currentY - initialTouchY) > 4) {
          hasMoved = true;
        }

        // Apply sensitivity percentage (100% = 1.5 multiplier)
        const sensMultiplier = mouseSensitivity / 100;
        pendingDx += dx * 1.5 * sensMultiplier;
        pendingDy += dy * 1.5 * sensMultiplier;
        checkThrottle();

      } else if (e.touches.length === 2) {
        // 2-finger gesture: Scroll or Pinch-Zoom
        const currentPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const pinchDelta = currentPinchDist - initialPinchDist;

        // If finger distance changes significantly, interpret as Pinch-to-Zoom
        const now = Date.now();
        if (Math.abs(pinchDelta) > 30 && now - lastZoomTime > 180) {
          lastZoomTime = now;
          hasMoved = true;
          if (pinchDelta > 0) {
            // Pinch-out: Zoom In (Ctrl + =)
            send({ type: 'key', key: '=', modifiers: ['control'] });
          } else {
            // Pinch-in: Zoom Out (Ctrl + -)
            send({ type: 'key', key: '-', modifiers: ['control'] });
          }
          initialPinchDist = currentPinchDist;
          return;
        }

        // Otherwise, 2-finger 2D scrolling (vertical dy + horizontal dx)
        const currentScrollX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        const scrollDeltaX = currentScrollX - lastScrollX;
        const scrollDeltaY = currentScrollY - lastScrollY;

        lastScrollX = currentScrollX;
        lastScrollY = currentScrollY;

        hasMoved = true;

        pendingScrollDy += -scrollDeltaY * 1.4;
        pendingScrollDx += -scrollDeltaX * 1.4;
        checkThrottle();
      }
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
      const elapsed = Date.now() - touchStartTime;

      if (isDoubleTapDrag) {
        // End double-tap drag on lift
        isDoubleTapDrag = false;
        send({ type: 'click', button: 'left', action: 'up' });
      } else if (!hasMoved && elapsed < 350) {
        // Tap detection (single-finger = left click, two-finger = right click)
        if (maxTouchCount === 1) {
          // If drag locked, tapping can release it
          if (isDragLocked) {
            setDragLock(false);
          } else {
            send({ type: 'click', button: 'left' });
            lastTapEndTime = Date.now();
            lastTapX = lastX;
            lastTapY = lastY;
          }
        } else if (maxTouchCount === 2) {
          send({ type: 'click', button: 'right' });
        }
      }

      if (e.touches.length === 0) {
        flushDeltas();
        maxTouchCount = 0;
      }
    }, { passive: false });

    element.addEventListener('touchcancel', () => {
      if (isDoubleTapDrag) {
        isDoubleTapDrag = false;
        send({ type: 'click', button: 'left', action: 'up' });
      }
      pendingDx = 0;
      pendingDy = 0;
      pendingScrollDy = 0;
      pendingScrollDx = 0;
      maxTouchCount = 0;
    });
  }

  // Initialize both touch surfaces
  setupTrackpadSurface(document.getElementById('touchSurfaceFull'));
  setupTrackpadSurface(document.getElementById('touchSurfaceBoth'));

  // Physical Left / Right click buttons
  function bindClickButtons(leftId, rightId) {
    const btnLeft = document.getElementById(leftId);
    const btnRight = document.getElementById(rightId);

    if (btnLeft) {
      btnLeft.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic('medium');
        send({ type: 'click', button: 'left' });
      });
    }
    if (btnRight) {
      btnRight.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic('medium');
        send({ type: 'click', button: 'right' });
      });
    }
  }

  bindClickButtons('btnLeftClick', 'btnRightClick');
  bindClickButtons('btnLeftClickBoth', 'btnRightClickBoth');

  // -------------------------------------------------------------
  // KEYBOARD & INPUT ENGINE (Keyboard & Both Modes)
  // -------------------------------------------------------------
  function setupKeyboardInput(inputEl, sendBtn, backspaceBtn) {
    if (!inputEl) return;

    inputEl.addEventListener('input', (e) => {
      const inputType = e.inputType;
      const val = e.data || inputEl.value;

      if (inputType === 'deleteContentBackward' || (!inputEl.value && inputType === 'deleteWordBackward')) {
        send({
          type: 'key',
          key: 'Backspace',
          modifiers: Array.from(activeModifiers)
        });
        triggerHaptic('light');
      } else if (val) {
        send({
          type: 'text',
          value: val
        });
        triggerHaptic('light');
      }

      inputEl.value = '';
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputEl.value) {
          send({ type: 'text', value: inputEl.value });
          inputEl.value = '';
        } else {
          send({
            type: 'key',
            key: 'Enter',
            modifiers: Array.from(activeModifiers)
          });
        }
        triggerHaptic('medium');
      }
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (inputEl.value) {
          send({ type: 'text', value: inputEl.value });
          inputEl.value = '';
        } else {
          send({ type: 'key', key: 'Enter', modifiers: Array.from(activeModifiers) });
        }
        triggerHaptic('medium');
      });
    }

    if (backspaceBtn) {
      backspaceBtn.addEventListener('click', () => {
        send({
          type: 'key',
          key: 'Backspace',
          modifiers: Array.from(activeModifiers)
        });
        triggerHaptic('medium');
      });
    }
  }

  setupKeyboardInput(bothTextInput, btnBothSend, btnBothBackspace);
  setupKeyboardInput(keyboardTextInput, btnKeyboardSend, btnKeyboardBackspace);

  // Special keys & Arrow buttons (Escape, Tab, Enter, Space, Arrows)
  document.querySelectorAll('.key-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('medium');
      const keyName = btn.dataset.key;
      send({
        type: 'key',
        key: keyName,
        modifiers: Array.from(activeModifiers)
      });

      // Clear modifiers after executing combination unless toggled again
      if (activeModifiers.size > 0) {
        activeModifiers.clear();
        document.querySelectorAll('.key-btn.modifier').forEach(m => m.classList.remove('active'));
      }
    });
  });

  // Shortcut buttons (Copy, Paste, Select All, Undo)
  document.querySelectorAll('.key-btn[data-shortcut]').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('medium');
      const sc = btn.dataset.shortcut;
      if (sc === 'copy') send({ type: 'key', key: 'c', modifiers: ['ctrl'] });
      else if (sc === 'paste') send({ type: 'key', key: 'v', modifiers: ['ctrl'] });
      else if (sc === 'select-all') send({ type: 'key', key: 'a', modifiers: ['ctrl'] });
      else if (sc === 'undo') send({ type: 'key', key: 'z', modifiers: ['ctrl'] });
    });
  });

  // Modifier toggle buttons (Ctrl, Alt, Shift)
  document.querySelectorAll('.key-btn.modifier[data-modifier]').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      const mod = btn.dataset.modifier;
      if (activeModifiers.has(mod)) {
        activeModifiers.delete(mod);
        document.querySelectorAll(`.key-btn.modifier[data-modifier="${mod}"]`).forEach(m => m.classList.remove('active'));
      } else {
        activeModifiers.add(mod);
        document.querySelectorAll(`.key-btn.modifier[data-modifier="${mod}"]`).forEach(m => m.classList.add('active'));
      }
    });
  });

  // Handle mobile browser tab focus, back-forward cache, and new QR scans
  function checkUrlUpdate() {
    const currentParams = new URLSearchParams(window.location.search);
    const newSession = currentParams.get('session');
    const newToken = currentParams.get('token');

    // If URL has fresh session/token params different from current, reload with fresh state
    if (newSession && (newSession !== sessionId || newToken !== token)) {
      clearReconnectData();
      window.location.reload();
      return;
    }

    // If socket is closed and we have valid credentials but aren't in terminal state, reconnect
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      if (!terminalState && sessionId && token) {
        connect();
      }
    }
  }

  window.addEventListener('pageshow', checkUrlUpdate);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkUrlUpdate();
    }
  });

  // ==========================================
  // STAGE 6: AI Tab, Pulse Trace & Voice Input
  // ==========================================
  const pulseTraceContainer = document.getElementById('pulseTraceContainer');
  const pulseTracePath = document.getElementById('pulseTracePath');
  const pulseTraceCheck = document.getElementById('pulseTraceCheck');
  const pulseTraceLabel = document.getElementById('pulseTraceLabel');
  const pulseTraceState = document.getElementById('pulseTraceState');
  const btnVoiceInput = document.getElementById('btnVoiceInput');
  const voiceBtnText = document.getElementById('voiceBtnText');
  const aiSpeechMsg = document.getElementById('aiSpeechMsg');
  const aiCommandInput = document.getElementById('aiCommandInput');
  const btnSendAiCommand = document.getElementById('btnSendAiCommand');
  const aiPlanSection = document.getElementById('aiPlanSection');
  const aiPlanStepCounter = document.getElementById('aiPlanStepCounter');
  const aiStepList = document.getElementById('aiStepList');
  const btnAiStop = document.getElementById('btnAiStop');
  const aiInsecureWarning = document.getElementById('aiInsecureWarning');

  let currentTraceState = 'idle';
  let speechRecognition = null;
  let isListening = false;
  let isMediaRecording = false;
  let mediaRecorder = null;
  let mediaChunks = [];
  let mediaRecordingTimeout = null;
  let activeAudioStream = null;
  let audioContext = null;
  let audioAnalyser = null;
  let audioMediaStream = null;
  let animFrameId = null;
  let lastMicError = null;
  let speechDetected = false;
  let lastSpeechTime = 0;

  // Pulse Trace state transitions (6 states strictly required)
  function setTraceState(state, labelText) {
    currentTraceState = state;
    if (!pulseTracePath || !pulseTraceLabel || !pulseTraceState) return;

    // Reset base path attributes and checkmark
    pulseTracePath.className.baseVal = 'pulse-trace-path';
    if (pulseTraceCheck) pulseTraceCheck.style.display = 'none';

    switch (state) {
      case 'idle':
        pulseTracePath.classList.add('trace-idle');
        pulseTracePath.setAttribute('d', 'M 0 24 L 130 24 L 140 24 L 145 18 L 150 30 L 155 24 L 165 24 L 320 24');
        pulseTraceLabel.textContent = labelText || 'Idle — Tap mic or type command';
        pulseTraceState.textContent = 'IDLE';
        break;

      case 'listening':
        pulseTracePath.classList.add('trace-listening');
        pulseTraceLabel.textContent = labelText || 'Listening...';
        pulseTraceState.textContent = 'LISTENING';
        break;

      case 'thinking':
        pulseTracePath.classList.add('trace-thinking');
        pulseTracePath.setAttribute('d', 'M 0 24 L 320 24');
        pulseTraceLabel.textContent = labelText || 'Thinking...';
        pulseTraceState.textContent = 'THINKING';
        break;

      case 'executing':
        pulseTracePath.classList.add('trace-executing');
        pulseTracePath.setAttribute('d', 'M 0 24 L 70 24 L 80 18 L 90 30 L 100 24 L 220 24 L 230 18 L 240 30 L 250 24 L 320 24');
        pulseTraceLabel.textContent = labelText || 'Executing...';
        pulseTraceState.textContent = 'EXECUTING';
        break;

      case 'blocked':
        pulseTracePath.classList.add('trace-blocked');
        // Visibly cut with a gap
        pulseTracePath.setAttribute('d', 'M 0 24 L 135 24 M 185 24 L 320 24');
        pulseTraceLabel.textContent = labelText || 'Blocked';
        pulseTraceState.textContent = 'BLOCKED';
        break;

      case 'done':
        pulseTracePath.classList.add('trace-done');
        pulseTracePath.setAttribute('d', 'M 0 24 L 295 24');
        if (pulseTraceCheck) pulseTraceCheck.style.display = 'block';
        pulseTraceLabel.textContent = labelText || 'Done';
        pulseTraceState.textContent = 'DONE';
        break;
    }
  }

  // Check secure context and show warning if needed
  const isSecureEnvironment = Boolean(window.isSecureContext) || window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (aiInsecureWarning) aiInsecureWarning.style.display = 'block';
    if (aiSpeechMsg) aiSpeechMsg.textContent = 'Insecure context: microphone requires HTTPS. Please open the https:// link.';
  }

  // Human-readable error message mapping for all mic & Web Speech errors
  function getHumanReadableMicError(err) {
    if (!err) return 'Unknown microphone error.';
    const name = err.name || '';
    const message = err.message || '';
    const errCode = err.error || '';

    // Insecure context / SecurityError
    if (name === 'SecurityError' || message.includes('insecure') || message.includes('secure context') || message.includes('HTTPS')) {
      return 'Insecure context: microphone access requires HTTPS. Please open the https:// link.';
    }

    // getUserMedia / MediaRecorder errors
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || errCode === 'not-allowed') {
      return 'Microphone permission denied. Please allow microphone access in your browser or device settings.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone found on this device. Please connect a microphone.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Microphone is busy or being used by another app. Please close other audio apps and try again.';
    }
    if (name === 'OverconstrainedError') {
      return 'Microphone does not satisfy requested audio constraints.';
    }
    if (name === 'AbortError') {
      return 'Microphone operation was aborted.';
    }

    // Web Speech API error codes
    if (errCode === 'network') {
      return 'Speech recognition network error. Switched to server transcription or use text box.';
    }
    if (errCode === 'no-speech') {
      return 'No speech detected. Please try speaking closer to the microphone.';
    }
    if (errCode === 'audio-capture') {
      return 'No microphone audio was captured. Check your microphone settings and try again.';
    }
    if (errCode === 'service-not-allowed') {
      return 'Speech recognition service is not allowed by your browser.';
    }

    if (message) return message;
    if (name) return `Microphone error (${name}). Please try typing instead.`;
    return 'Microphone error. Please try typing instead.';
  }

  // Live Mic Diagnostics Updater
  async function updateMicDiagnostics(err = null) {
    if (err) {
      lastMicError = {
        name: err.name || err.error || 'Error',
        message: err.message || err.error || String(err)
      };
    }

    const isSecure = Boolean(window.isSecureContext);
    const protocol = window.location.protocol;
    const userAgent = navigator.userAgent;
    const hasGetUserMedia = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    const hasSpeechRec = Boolean(SpeechRec);

    let permState = 'unavailable';
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const pStatus = await navigator.permissions.query({ name: 'microphone' });
        permState = pStatus.state;
        pStatus.onchange = () => {
          updateMicDiagnostics();
        };
      } catch (_) {
        permState = 'unsupported';
      }
    }

    const elSecure = document.getElementById('diagSecureContext');
    const elProto = document.getElementById('diagProtocol');
    const elUa = document.getElementById('diagUserAgent');
    const elGum = document.getElementById('diagGetUserMedia');
    const elPerm = document.getElementById('diagMicPermission');
    const elSpeech = document.getElementById('diagSpeechRecognition');
    const elLastErr = document.getElementById('diagLastError');
    const badge = document.getElementById('diagStatusBadge');

    if (elSecure) elSecure.textContent = isSecure ? 'true' : 'false (INSECURE)';
    if (elProto) elProto.textContent = protocol;
    if (elUa) elUa.textContent = userAgent;
    if (elGum) elGum.textContent = hasGetUserMedia ? 'true' : 'false';
    if (elPerm) elPerm.textContent = permState;
    if (elSpeech) elSpeech.textContent = hasSpeechRec ? (window.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition') : 'false';
    if (elLastErr) {
      elLastErr.textContent = lastMicError ? `${lastMicError.name}: ${lastMicError.message}` : 'None';
    }

    if (badge) {
      if (!isSecure && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        badge.textContent = 'Insecure';
        badge.className = 'mic-diag-status blocked';
      } else if (lastMicError) {
        badge.textContent = 'Error';
        badge.className = 'mic-diag-status blocked';
      } else if (hasGetUserMedia) {
        badge.textContent = permState === 'granted' ? 'Active' : (permState === 'denied' ? 'Denied' : 'Ready');
        badge.className = permState === 'denied' ? 'mic-diag-status blocked' : 'mic-diag-status safe';
      } else if (hasSpeechRec) {
        badge.textContent = 'WebSpeech';
        badge.className = 'mic-diag-status confirm';
      } else {
        badge.textContent = 'No Mic';
        badge.className = 'mic-diag-status blocked';
      }
    }
  }

  // Report mic error to UI, diagnostics, and server console
  function reportMicError(err) {
    const friendly = getHumanReadableMicError(err);
    const errName = err ? (err.name || err.error || 'MicrophoneError') : 'MicrophoneError';
    const errMsg = err ? (err.message || err.error || String(err)) : friendly;

    if (aiSpeechMsg) {
      aiSpeechMsg.textContent = friendly;
    }

    updateMicDiagnostics({ name: errName, message: friendly });

    const payload = {
      name: errName,
      message: errMsg,
      userFriendly: friendly,
      secureContext: Boolean(window.isSecureContext),
      protocol: window.location.protocol,
      userAgent: navigator.userAgent
    };

    // Send error to server so it is printed in server console
    if (typeof send === 'function' && ws && ws.readyState === 1 && isPaired) {
      send({ type: 'mic_error', error: payload });
    } else {
      fetch('/api/ai/log-mic-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  }

  // Audio MIME type selection using MediaRecorder.isTypeSupported
  function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    // Check supported types in exact priority order: audio/webm;codecs=opus, then audio/mp4
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return 'audio/mp4';
    }
    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm';
    }
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      return 'audio/ogg;codecs=opus';
    }
    return '';
  }

  // Render plan steps in the phone UI
  function renderPlanSteps(steps = []) {
    if (!aiStepList) return;
    aiStepList.innerHTML = '';

    steps.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = 'ai-step-item';
      item.id = `phoneStep-${idx}`;

      const titleWrap = document.createElement('div');
      titleWrap.className = 'ai-step-title';

      const num = document.createElement('span');
      num.className = 'ai-step-num';
      num.textContent = `${idx + 1}.`;

      const desc = document.createElement('span');
      desc.textContent = step.description || step.tool;

      titleWrap.appendChild(num);
      titleWrap.appendChild(desc);

      const badge = document.createElement('span');
      const risk = step.risk || 'safe';
      badge.className = `status-badge ${risk}`;
      badge.textContent = risk === 'blocked' ? 'Blocked' : (risk === 'confirm' ? 'Needs approval' : 'Safe');

      item.appendChild(titleWrap);
      item.appendChild(badge);
      aiStepList.appendChild(item);
    });
  }

  function handleAiPlan(plan) {
    if (!plan) return;
    const steps = plan.steps || [];
    if (aiPlanSection) aiPlanSection.style.display = 'flex';
    if (aiPlanStepCounter) aiPlanStepCounter.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
    renderPlanSteps(steps);

    if (steps.length === 0) {
      setTraceState('blocked', plan.reason || 'No safe plan could be generated');
      if (aiSpeechMsg) aiSpeechMsg.textContent = plan.reason || 'No executable actions.';
    } else {
      setTraceState('done', `Plan ready: ${steps.length} step${steps.length === 1 ? '' : 's'}`);
      if (aiSpeechMsg) aiSpeechMsg.textContent = plan.summary || 'Plan generated successfully.';
    }
    triggerHaptic('light');
  }

  function handleExecutionProgress(msg) {
    const { currentStep, totalSteps, step } = msg;
    setTraceState('executing', `Step ${currentStep} of ${totalSteps}: ${step?.tool || 'working'}`);
    if (btnAiStop) btnAiStop.style.display = 'inline-block';
    if (aiSpeechMsg) aiSpeechMsg.textContent = step?.description || `Running step ${currentStep}...`;

    // Highlight active step item
    if (aiStepList) {
      aiStepList.querySelectorAll('.ai-step-item').forEach((item, idx) => {
        if (idx + 1 === currentStep) {
          item.classList.add('active');
          item.classList.remove('completed');
        } else if (idx + 1 < currentStep) {
          item.classList.remove('active');
          item.classList.add('completed');
        } else {
          item.classList.remove('active');
          item.classList.remove('completed');
        }
      });
    }
  }

  // Audio analyser for real-time microphone volume modulation during 'listening'
  async function startAudioMonitoring(existingStream = null) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch (_) {}
      }

      if (existingStream) {
        audioMediaStream = existingStream;
      } else if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        audioMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else {
        return;
      }

      const source = audioContext.createMediaStreamSource(audioMediaStream);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 64;
      source.connect(audioAnalyser);

      const bufferLength = audioAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function renderFrame() {
        if ((!isListening && !isMediaRecording) || currentTraceState !== 'listening') return;
        audioAnalyser.getByteFrequencyData(dataArray);

        // Calculate average volume / energy
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength; // 0 to 255
        const amp = Math.min(20, Math.max(2, (avg / 255) * 22));

        // Automatic voice activity & silence detection
        if (avg > 25) {
          speechDetected = true;
          lastSpeechTime = Date.now();
        } else if (speechDetected && isMediaRecording && (Date.now() - lastSpeechTime > 1200)) {
          speechDetected = false;
          stopMediaRecording(true);
          return;
        }

        // Dynamically modulate path amplitude
        if (pulseTracePath) {
          pulseTracePath.setAttribute(
            'd',
            `M 0 24 Q 60 ${24 - amp} 120 24 T 240 ${24 + amp} T 320 24`
          );
        }
        animFrameId = requestAnimationFrame(renderFrame);
      }
      renderFrame();
    } catch (_) {
      // Audio level visualizer fallback - still functional without analyser
    }
  }

  function stopAudioMonitoring(stopTracks = false) {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (stopTracks && audioMediaStream) {
      try {
        audioMediaStream.getTracks().forEach(t => t.stop());
      } catch (_) {}
      audioMediaStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch (_) {}
      audioContext = null;
    }
  }

  // Web Speech API initialization (used as fallback when MediaRecorder is unavailable)
  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const isSpeechSupported = !!SpeechRecognition;

  if (!isSpeechSupported && typeof MediaRecorder === 'undefined' && aiSpeechMsg) {
    aiSpeechMsg.textContent = 'Speech recognition not supported in this browser. Please type commands below.';
  }

  // MediaRecorder Push-to-Talk Implementation (Primary Method, max 20 seconds)
  async function startMediaRecording() {
    // 1. Secure context check
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const secErr = new Error('Insecure context: microphone requires HTTPS. Please open the https:// link.');
      secErr.name = 'SecurityError';
      reportMicError(secErr);
      return;
    }

    // 2. getUserMedia capability check
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      if (isSpeechSupported) {
        console.warn('[Phone] getUserMedia not available, using Web Speech fallback');
        startWebSpeechListening();
        return;
      }
      const gumErr = new Error('Microphone access is not supported in this browser context.');
      gumErr.name = 'NotFoundError';
      reportMicError(gumErr);
      return;
    }

    try {
      const selectedMime = getSupportedAudioMimeType();
      activeAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      mediaChunks = [];
      const options = selectedMime ? { mimeType: selectedMime } : {};
      try {
        mediaRecorder = new MediaRecorder(activeAudioStream, options);
      } catch (_) {
        mediaRecorder = new MediaRecorder(activeAudioStream);
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          mediaChunks.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        const err = e.error || new Error('MediaRecorder error');
        reportMicError(err);
        stopMediaRecording(false);
      };

      mediaRecorder.onstop = () => {
        const wasRecording = isMediaRecording;
        isMediaRecording = false;
        isListening = false;
        if (mediaRecordingTimeout) {
          clearTimeout(mediaRecordingTimeout);
          mediaRecordingTimeout = null;
        }

        if (activeAudioStream) {
          try {
            activeAudioStream.getTracks().forEach(t => t.stop());
          } catch (_) {}
          activeAudioStream = null;
        }
        stopAudioMonitoring();

        if (btnVoiceInput) btnVoiceInput.classList.remove('listening');

        if (!wasRecording) {
          if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
          setTraceState('idle');
          return;
        }

        const finalMime = (mediaRecorder && mediaRecorder.mimeType) || selectedMime || 'audio/webm';
        const audioBlob = new Blob(mediaChunks, { type: finalMime });

        if (audioBlob.size < 50) {
          if (aiSpeechMsg) aiSpeechMsg.textContent = 'No microphone audio was captured. Check your microphone settings and try again.';
          setTraceState('idle');
          if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
          updateMicDiagnostics({ name: 'audio-capture', message: 'No audio captured' });
          return;
        }

        if (voiceBtnText) voiceBtnText.textContent = 'Transcribing...';
        setTraceState('thinking', 'Transcribing audio with Gemini...');
        if (aiSpeechMsg) aiSpeechMsg.textContent = 'Transcribing audio with Gemini...';

        const reader = new FileReader();
        reader.onloadend = () => {
          const resultStr = reader.result || '';
          const base64Data = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
          sendAudioForTranscription(base64Data, finalMime);
        };
        reader.onerror = () => {
          const rErr = new Error('Failed to read recorded audio file.');
          reportMicError(rErr);
          setTraceState('idle');
          if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
        };
        reader.readAsDataURL(audioBlob);
      };

      speechDetected = false;
      lastSpeechTime = Date.now();
      isMediaRecording = true;
      isListening = true;
      mediaRecorder.start(250);

      if (btnVoiceInput) btnVoiceInput.classList.add('listening');
      if (voiceBtnText) voiceBtnText.textContent = 'Listening... (Tap to finish)';
      if (aiSpeechMsg) aiSpeechMsg.textContent = 'Listening... Speak your command, then tap to finish.';
      setTraceState('listening', 'Listening...');
      triggerHaptic('medium');

      // Modulate trace visualizer with the active stream
      startAudioMonitoring(activeAudioStream);

      // Background safety timeout (max 10s recording)
      if (mediaRecordingTimeout) clearTimeout(mediaRecordingTimeout);
      mediaRecordingTimeout = setTimeout(() => {
        if (isMediaRecording) {
          if (aiSpeechMsg) aiSpeechMsg.textContent = 'Processing command...';
          stopMediaRecording(true);
        }
      }, 10000);

      updateMicDiagnostics();

    } catch (err) {
      reportMicError(err);
      if (btnVoiceInput) btnVoiceInput.classList.remove('listening');
      if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
      setTraceState('idle');

      // If MediaRecorder failed and Web Speech is supported, fall back
      if (isSpeechSupported && err.name !== 'NotAllowedError' && err.name !== 'SecurityError') {
        console.warn('[Phone] MediaRecorder failed, falling back to Web Speech API...');
        startWebSpeechListening();
      }
    }
  }

  function stopMediaRecording(shouldTranscribe = true) {
    if (mediaRecordingTimeout) {
      clearTimeout(mediaRecordingTimeout);
      mediaRecordingTimeout = null;
    }
    if (!isMediaRecording && (!mediaRecorder || mediaRecorder.state === 'inactive')) {
      return;
    }
    if (!shouldTranscribe) {
      isMediaRecording = false;
      isListening = false;
      if (btnVoiceInput) btnVoiceInput.classList.remove('listening');
      if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
      setTraceState('idle');
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (_) {}
    }
  }

  // Send recorded audio to server for Gemini transcription
  function sendAudioForTranscription(base64Audio, mimeType) {
    if (ws && ws.readyState === 1) {
      send({
        type: 'ai_transcribe_audio',
        audio: base64Audio,
        mimeType: mimeType
      });
    } else {
      fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType: mimeType
        })
      })
      .then(r => r.json())
      .then(handleTranscribeResponse)
      .catch(err => {
        handleTranscribeResponse({ success: false, error: { message: err.message } });
      });
    }
  }

  // Handle server Gemini transcription response
  function handleTranscribeResponse(msg) {
    if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
    if (btnVoiceInput) btnVoiceInput.classList.remove('listening');

    if (msg.success) {
      const transcript = (msg.transcript || '').trim();
      if (!transcript) {
        if (aiSpeechMsg) aiSpeechMsg.textContent = 'No speech detected. Please try speaking closer to the microphone.';
        setTraceState('idle', 'No speech detected — Type or tap mic');
        updateMicDiagnostics({ name: 'no-speech', message: 'No speech detected in audio' });
      } else {
        if (aiCommandInput) {
          aiCommandInput.value = transcript;
        }
        triggerHaptic('medium');
        // Automatically dispatch command to server so it performs operations on laptop
        submitAiCommand();
      }
    } else {
      const errMsg = (msg.error && msg.error.message) ? msg.error.message : 'Audio transcription failed.';
      reportMicError(new Error(errMsg));
      setTraceState('idle');
    }
  }

  // Fallback: Web Speech API Listening
  function startWebSpeechListening() {
    if (!isSpeechSupported) {
      if (aiSpeechMsg) aiSpeechMsg.textContent = 'Speech recognition not supported in this browser. Please type commands below.';
      reportMicError(new Error('Speech recognition not supported in this browser. Please type commands below.'));
      return;
    }

    try {
      speechRecognition = new SpeechRecognition();
      speechRecognition.lang = 'en-US';
      speechRecognition.interimResults = true;
      speechRecognition.continuous = false;

      speechRecognition.onstart = () => {
        isListening = true;
        if (btnVoiceInput) btnVoiceInput.classList.add('listening');
        if (voiceBtnText) voiceBtnText.textContent = 'Listening...';
        if (aiSpeechMsg) aiSpeechMsg.textContent = 'Listening to your command...';
        setTraceState('listening', 'Listening...');
        triggerHaptic('medium');
        startAudioMonitoring();
      };

      speechRecognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const text = final || interim;
        if (aiCommandInput && text) {
          aiCommandInput.value = text;
        }
      };

      speechRecognition.onerror = (e) => {
        reportMicError(e);
        stopWebSpeechListening();
        setTraceState('idle');
      };

      speechRecognition.onend = () => {
        stopWebSpeechListening();
        if (aiCommandInput && aiCommandInput.value.trim()) {
          triggerHaptic('medium');
          // Automatically dispatch command to server so it performs operations on laptop
          submitAiCommand();
        } else {
          setTraceState('idle');
        }
      };

      speechRecognition.start();
    } catch (err) {
      reportMicError(err);
      stopWebSpeechListening();
      setTraceState('idle');
    }
  }

  function stopWebSpeechListening() {
    isListening = false;
    stopAudioMonitoring(true);
    if (speechRecognition) {
      try {
        speechRecognition.stop();
      } catch (_) {}
      speechRecognition = null;
    }
    if (btnVoiceInput) btnVoiceInput.classList.remove('listening');
    if (voiceBtnText) voiceBtnText.textContent = 'Tap to Speak';
  }

  // Voice button click handler (Push-to-talk, primary MediaRecorder, fallback Web Speech)
  if (btnVoiceInput) {
    btnVoiceInput.addEventListener('click', () => {
      triggerHaptic('light');

      // Stop if currently recording
      if (isMediaRecording) {
        stopMediaRecording(true);
        return;
      }
      if (isListening) {
        stopWebSpeechListening();
        setTraceState('idle');
        return;
      }

      // Check secure context
      if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const secErr = new Error('Insecure context: microphone requires HTTPS. Please open the https:// link.');
        secErr.name = 'SecurityError';
        reportMicError(secErr);
        return;
      }

      // Primary method: MediaRecorder
      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      const hasGetUserMedia = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');

      if (hasMediaRecorder && hasGetUserMedia) {
        startMediaRecording();
      } else if (isSpeechSupported) {
        startWebSpeechListening();
      } else {
        const noSuppErr = new Error('Speech recognition not supported in this browser. Please type commands below.');
        noSuppErr.name = 'NotFoundError';
        reportMicError(noSuppErr);
      }
    });
  }

  // Initial diagnostics query
  updateMicDiagnostics();

  // Send AI command via button or Enter
  function submitAiCommand() {
    if (!aiCommandInput) return;
    const command = aiCommandInput.value.trim();
    if (!command) return;

    triggerHaptic('medium');
    setTraceState('thinking', 'Planning action...');
    if (aiSpeechMsg) aiSpeechMsg.textContent = 'Analyzing command with Gemini...';

    // Send to server via WebSocket
    send({
      type: 'ai_command',
      command: command
    });
  }

  if (btnSendAiCommand) {
    btnSendAiCommand.addEventListener('click', submitAiCommand);
  }

  if (aiCommandInput) {
    aiCommandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAiCommand();
      }
    });
  }

  // Stop button handler (instant abort)
  if (btnAiStop) {
    btnAiStop.addEventListener('click', () => {
      triggerHaptic('heavy');
      send({ type: 'ai_stop' });
      setTraceState('blocked', 'Aborted by user');
      btnAiStop.style.display = 'none';
    });
  }

  // Stage 15: Demo Mode pills handler
  document.querySelectorAll('.demo-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      const cmd = btn.getAttribute('data-command') || btn.textContent.trim();
      if (aiCommandInput) {
        aiCommandInput.value = cmd;
        setTraceState('idle', 'Example selected — Tap Send');
      }
    });
  });

  // Expose trace API for testing and window controller
  window.pulseTrace = {
    setTraceState,
    getState: () => currentTraceState,
    isSpeechSupported: () => isSpeechSupported,
    updateMicDiagnostics,
    getHumanReadableMicError,
    getSupportedAudioMimeType,
    getLastMicError: () => lastMicError
  };
  window.micDiagnostics = {
    update: updateMicDiagnostics,
    getErrorString: getHumanReadableMicError,
    getSupportedMime: getSupportedAudioMimeType,
    getLastError: () => lastMicError
  };

  // Start connection
  connect();
})();
