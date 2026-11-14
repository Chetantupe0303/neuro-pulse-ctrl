/**
 * PulseCtrl - Laptop UI Controller
 * Manages WebSocket connection, QR code display, status updates, and "Allow this device?" flow.
 */

(function () {
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const qrSection = document.getElementById('qrSection');
  const qrImage = document.getElementById('qrImage');
  const connectedSection = document.getElementById('connectedSection');
  const connectedDeviceName = document.getElementById('connectedDeviceName');
  const activeModeBadge = document.getElementById('activeModeBadge');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const btnNewQR = document.getElementById('btnNewQR');

  // Helper connection prompt elements
  const helperNotice = document.getElementById('helperNotice');

  // Modal elements
  const allowModal = document.getElementById('allowModal');
  const modalDeviceName = document.getElementById('modalDeviceName');
  const allowBtn = document.getElementById('allowBtn');
  const denyBtn = document.getElementById('denyBtn');

  // Stage 12: Activity Timeline & Guardian Elements
  const timelineList = document.getElementById('timelineList');
  const timelineCount = document.getElementById('timelineCount');
  const timelineEmpty = document.querySelector('.timeline-empty-state');
  const guardianPlanContainer = document.getElementById('guardianPlanContainer');
  const guardianEmpty = document.querySelector('.guardian-empty-state');

  // Stage 12: Step Confirmation Modal & 30s Auto-Deny Countdown
  const confirmStepModal = document.getElementById('confirmStepModal');
  const confirmStepTool = document.getElementById('confirmStepTool');
  const confirmStepReason = document.getElementById('confirmStepReason');
  const confirmStepCountdown = document.getElementById('confirmStepCountdown');
  const allowStepBtn = document.getElementById('allowStepBtn');
  const denyStepBtn = document.getElementById('denyStepBtn');

  let countdownInterval = null;
  let activePendingStepId = null;
  let totalAuditCount = 0;

  let ws = null;
  let currentSessionId = null;

  function setStatus(state, text) {
    statusPill.className = 'status-pill status-' + state;
    statusText.textContent = text;

    if (state === 'connected') {
      qrSection.style.display = 'none';
      if (helperNotice) helperNotice.style.display = 'none';
      connectedSection.classList.add('active');
      disconnectBtn.disabled = false;
    } else if (state === 'waiting') {
      qrSection.style.display = 'flex';
      connectedSection.classList.remove('active');
      disconnectBtn.disabled = false;
    } else if (state === 'disconnected') {
      connectedSection.classList.remove('active');
      disconnectBtn.disabled = true;
    }
  }

  function showModal(deviceName) {
    modalDeviceName.textContent = deviceName || 'Mobile Device';
    allowModal.classList.add('active');
  }

  function hideModal() {
    allowModal.classList.remove('active');
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const approvalToken = params.get('approval');
    const wsUrl = `${protocol}//${window.location.host}/ws?role=laptop_web&session=${encodeURIComponent(sessionId || '')}&approval=${encodeURIComponent(approvalToken || '')}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Laptop] Connected to server via WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'session_info') {
          currentSessionId = msg.sessionId;
          const pageUrl = new URL(window.location.href);
          pageUrl.searchParams.set('session', msg.sessionId);
          if (msg.approvalToken) pageUrl.searchParams.set('approval', msg.approvalToken);
          window.history.replaceState({}, '', pageUrl);
          hideModal();
          if (helperNotice) helperNotice.style.display = 'none';
          qrSection.style.display = 'flex';

          if (msg.qrDataUrl) {
            qrImage.src = msg.qrDataUrl;
          }

          if (msg.status === 'connected') {
            if (msg.deviceName && connectedDeviceName) {
              connectedDeviceName.textContent = msg.deviceName;
            }
            setStatus('connected', 'Phone connected');
          } else {
            setStatus('waiting', 'Waiting for phone');
          }

          if (msg.mode) {
            const modeLabel = msg.mode === 'trackpad' ? 'Mousepad' : (msg.mode === 'both' ? 'Both' : msg.mode);
            activeModeBadge.textContent = 'Mode: ' + modeLabel;
          }
        } else if (msg.type === 'waiting_helper') {
          const pageUrl = new URL(window.location.href);
          pageUrl.searchParams.delete('session');
          pageUrl.searchParams.delete('approval');
          window.history.replaceState({}, '', pageUrl);
          setStatus('disconnected', 'Start the local helper');
          disconnectBtn.disabled = true;
          qrSection.style.display = 'none';
          if (helperNotice) {
            helperNotice.style.display = 'block';
          }
        } else if (msg.type === 'pair_request') {
          // Phone scanned QR and wants to connect (shows clean device name only)
          showModal(msg.deviceName);
        } else if (msg.type === 'status') {
          if (msg.status === 'connected') {
            hideModal();
            if (helperNotice) helperNotice.style.display = 'none';
            if (msg.deviceName && connectedDeviceName) {
              connectedDeviceName.textContent = msg.deviceName;
            }
            setStatus('connected', 'Phone connected');
          } else if (msg.status === 'waiting') {
            hideModal();
            setStatus('waiting', 'Waiting for phone');
          } else if (msg.status === 'disconnected') {
            hideModal();
            // Disconnected: laptop automatically awaits fresh QR from server
            setStatus('waiting', 'Generating fresh QR code...');
          }
        } else if (msg.type === 'mode') {
          const modeLabel = msg.value === 'trackpad' ? 'Mousepad' : (msg.value === 'both' ? 'Both' : msg.value);
          activeModeBadge.textContent = 'Mode: ' + modeLabel;
        } else if (msg.type === 'expired') {
          hideModal();
          setStatus('waiting', 'Generating new QR code...');
        } else if (msg.type === 'audit_log_entry') {
          appendAuditEntry(msg.entry);
        } else if (msg.type === 'ai_plan_preview' || msg.type === 'ai_plan') {
          renderGuardianPlan(msg.plan);
        } else if (msg.type === 'confirm_step_request') {
          showStepConfirmModal(msg);
        }
      } catch (e) {
        console.error('[Laptop] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      console.warn('[Laptop] WebSocket closed. Retrying in 2 seconds...');
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[Laptop] WebSocket error:', err);
    };
  }

  // ==========================================
  // Stage 12: Activity Timeline & Guardian Panel UI
  // ==========================================
  function appendAuditEntry(entry) {
    if (!entry || !timelineList) return;
    if (timelineEmpty) timelineEmpty.style.display = 'none';
    timelineList.style.display = 'flex';

    totalAuditCount++;
    if (timelineCount) timelineCount.textContent = `${totalAuditCount} event${totalAuditCount === 1 ? '' : 's'}`;

    const li = document.createElement('li');
    li.className = 'timeline-entry card-subtle';
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.padding = 'var(--space-2) var(--space-3)';
    li.style.fontSize = '12px';
    li.style.borderBottom = '1px solid var(--border)';
    li.style.fontFamily = 'var(--font-mono)';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = 'var(--space-2)';

    const time = document.createElement('span');
    time.style.color = 'var(--text-muted)';
    time.textContent = `[${entry.timestamp || '00:00:00'}]`;

    const tool = document.createElement('strong');
    tool.style.color = 'var(--text-primary)';
    tool.textContent = entry.tool;

    const desc = document.createElement('span');
    desc.style.color = 'var(--text-secondary)';
    desc.textContent = entry.description ? ` - ${entry.description}` : '';

    left.appendChild(time);
    left.appendChild(tool);
    left.appendChild(desc);

    const badge = document.createElement('span');
    const risk = entry.risk || 'safe';
    badge.className = `status-badge ${risk}`;
    badge.textContent = risk === 'blocked' ? 'Blocked' : (risk === 'confirm' ? 'Needs approval' : 'Safe');

    li.appendChild(left);
    li.appendChild(badge);

    // Prepend new entries to top of timeline
    timelineList.insertBefore(li, timelineList.firstChild);
  }

  function renderGuardianPlan(plan) {
    if (!plan || !guardianPlanContainer) return;
    if (guardianEmpty) guardianEmpty.style.display = 'none';
    guardianPlanContainer.style.display = 'flex';
    guardianPlanContainer.style.flexDirection = 'column';
    guardianPlanContainer.style.gap = 'var(--space-2)';
    guardianPlanContainer.innerHTML = '';

    const steps = plan.steps || [];
    steps.forEach((step, idx) => {
      const row = document.createElement('div');
      row.className = 'guardian-step-row card-subtle';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = 'var(--space-2) var(--space-3)';
      row.style.fontSize = '12px';
      row.style.border = '1px solid var(--border)';
      row.style.borderRadius = 'var(--radius-sm)';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = 'var(--space-2)';

      const num = document.createElement('span');
      num.style.fontFamily = 'var(--font-mono)';
      num.style.color = 'var(--text-muted)';
      num.textContent = `${idx + 1}.`;

      const title = document.createElement('span');
      title.textContent = step.description || step.tool;

      left.appendChild(num);
      left.appendChild(title);

      const badge = document.createElement('span');
      const risk = step.risk || 'safe';
      badge.className = `status-badge ${risk}`;
      badge.textContent = risk === 'blocked' ? 'Blocked' : (risk === 'confirm' ? 'Needs approval' : 'Safe');

      row.appendChild(left);
      row.appendChild(badge);
      guardianPlanContainer.appendChild(row);
    });
  }

  function showStepConfirmModal(msg) {
    if (!confirmStepModal) return;
    activePendingStepId = msg.stepId || (msg.step && msg.step.id);
    if (confirmStepTool) confirmStepTool.textContent = `${msg.step?.tool || 'Action'}: ${msg.step?.description || ''}`;
    if (confirmStepReason) confirmStepReason.textContent = msg.step?.guardianReason || 'Requires owner review';

    confirmStepModal.style.display = 'flex';
    let timeLeft = 30;
    if (confirmStepCountdown) confirmStepCountdown.textContent = `${timeLeft}s`;

    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      timeLeft--;
      if (confirmStepCountdown) confirmStepCountdown.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        respondStepConfirmation(false, true);
      }
    }, 1000);
  }

  function hideStepConfirmModal() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (confirmStepModal) confirmStepModal.style.display = 'none';
  }

  function respondStepConfirmation(allow, autoDenied = false) {
    if (ws && ws.readyState === WebSocket.OPEN && activePendingStepId) {
      ws.send(JSON.stringify({
        type: 'step_confirmation_response',
        stepId: activePendingStepId,
        allow: allow === true,
        autoDenied: autoDenied === true
      }));
    }
    hideStepConfirmModal();
  }

  if (allowStepBtn) {
    allowStepBtn.addEventListener('click', () => respondStepConfirmation(true));
  }

  if (denyStepBtn) {
    denyStepBtn.addEventListener('click', () => respondStepConfirmation(false));
  }

  // Handle Allow button
  allowBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'pair_response', allow: true }));
    }
    hideModal();
  });

  // Handle Deny button
  denyBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'pair_response', allow: false }));
    }
    hideModal();
  });

  // Handle Disconnect button
  disconnectBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }));
    }
  });

  // Handle New QR Code button
  if (btnNewQR) {
    btnNewQR.addEventListener('click', () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'request_new_qr' }));
      }
    });
  }

  // Initialize connection
  connectWebSocket();
})();
