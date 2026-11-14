/**
 * Audit Log Engine for PulseCtrl AI
 * Maintains a persistent, chronological, per-session log of all AI actions,
 * risk classifications, owner confirmation decisions, and execution outcomes.
 */

class AuditLogger {
  constructor() {
    this.logsBySession = new Map(); // sessionId -> Array of audit events
    this.counter = 0;
  }

  /**
   * Log an event into the session's audit trail
   * @param {string} sessionId
   * @param {Object} eventData
   * @returns {Object} the formatted audit log entry
   */
  log(sessionId, eventData) {
    if (!sessionId) return null;

    this.counter++;
    const now = new Date();
    const timeFormatted = now.toTimeString().split(' ')[0]; // HH:MM:SS

    const entry = {
      id: `evt-${this.counter}-${Date.now().toString(36)}`,
      timestamp: timeFormatted,
      isoTime: now.toISOString(),
      type: eventData.type || 'action',
      tool: eventData.tool || '-',
      description: eventData.description || '',
      risk: eventData.risk || 'safe', // 'safe' | 'confirm' | 'blocked'
      decision: eventData.decision || 'executed', // 'allowed' | 'denied' | 'auto_denied' | 'executed' | 'blocked'
      reason: eventData.reason || '',
      stepIndex: eventData.stepIndex || 0,
      totalSteps: eventData.totalSteps || 0
    };

    const sessionList = this.logsBySession.get(sessionId) || [];
    sessionList.push(entry);
    this.logsBySession.set(sessionId, sessionList);

    return entry;
  }

  /**
   * Get all recorded audit events for a session
   * @param {string} sessionId
   * @returns {Array}
   */
  getEvents(sessionId) {
    return this.logsBySession.get(sessionId) || [];
  }

  /**
   * Aggregate statistics for session
   * @param {string} sessionId
   * @returns {{ total: number, safe: number, confirm: number, blocked: number }}
   */
  getStats(sessionId) {
    const events = this.getEvents(sessionId);
    let safe = 0;
    let confirm = 0;
    let blocked = 0;

    for (const e of events) {
      if (e.risk === 'safe') safe++;
      else if (e.risk === 'confirm') confirm++;
      else if (e.risk === 'blocked') blocked++;
    }

    return {
      total: events.length,
      safe,
      confirm,
      blocked
    };
  }

  /**
   * Clear logs for a session
   * @param {string} sessionId
   */
  clearSession(sessionId) {
    this.logsBySession.delete(sessionId);
  }
}

module.exports = new AuditLogger();
module.exports.AuditLogger = AuditLogger;
