/**
 * Plan Execution Runner for PulseCtrl AI
 * Executes validated action plans step by step through the local helper protocol.
 * Emits live progress, handles acknowledgments, halts on failures, and cancels instantly on Stop.
 */

class PlanRunner {
  constructor(options = {}) {
    this.session = options.session || null;
    this.stepTimeoutMs = options.stepTimeoutMs || 15000;
    this.isExecuting = false;
    this.isCancelled = false;
    this.currentStepIndex = -1;
    this.currentPlan = null;
    this.pendingStepResolver = null;
    this.pendingStepTimeout = null;

    this.onProgress = options.onProgress || (() => {});
    this.onDone = options.onDone || (() => {});
    this.onStopped = options.onStopped || (() => {});
    this.sendToHelper = options.sendToHelper || (() => {});
    this.requestConfirmation = options.requestConfirmation || null;
    this.pendingConfirmResolver = null;
    this.pendingConfirmTimeout = null;
  }

  /**
   * Handle owner confirmation response from laptop
   * @param {Object} response - { stepId, allow: boolean, autoDenied?: boolean }
   */
  handleConfirmResponse(response) {
    if (!this.pendingConfirmResolver) return;

    if (this.pendingConfirmTimeout) {
      clearTimeout(this.pendingConfirmTimeout);
      this.pendingConfirmTimeout = null;
    }

    const resolve = this.pendingConfirmResolver;
    this.pendingConfirmResolver = null;
    resolve(response);
  }

  /**
   * Handle step acknowledgment from helper
   * @param {Object} ack - { type: 'ai_step_ack', stepId, success, error }
   */
  handleStepAck(ack) {
    if (!this.isExecuting || !this.pendingStepResolver) return;

    if (this.pendingStepTimeout) {
      clearTimeout(this.pendingStepTimeout);
      this.pendingStepTimeout = null;
    }

    const resolve = this.pendingStepResolver;
    this.pendingStepResolver = null;
    resolve(ack);
  }

  /**
   * Instantly cancel the running plan
   * @param {string} [reason='Cancelled by user']
   */
  stop(reason = 'Cancelled by user') {
    if (!this.isExecuting) return;

    this.isCancelled = true;
    this.isExecuting = false;

    if (this.pendingStepTimeout) {
      clearTimeout(this.pendingStepTimeout);
      this.pendingStepTimeout = null;
    }

    if (this.pendingStepResolver) {
      const resolve = this.pendingStepResolver;
      this.pendingStepResolver = null;
      resolve({ success: false, error: reason, stopped: true });
    }

    this.onStopped({
      reason,
      stepIndex: this.currentStepIndex + 1,
      totalSteps: this.currentPlan ? this.currentPlan.steps.length : 0
    });
  }

  /**
   * Execute all steps in a validated plan sequentially
   * @param {Object} plan - Frozen validated plan object
   * @returns {Promise<{ success: boolean, reason?: string, completedSteps: number }>}
   */
  async execute(plan) {
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      return { success: false, reason: 'No steps to execute', completedSteps: 0 };
    }

    this.currentPlan = plan;
    this.isExecuting = true;
    this.isCancelled = false;
    this.currentStepIndex = -1;

    const totalSteps = plan.steps.length;

    for (let i = 0; i < totalSteps; i++) {
      if (this.isCancelled) {
        return { success: false, reason: 'Execution cancelled', completedSteps: i };
      }

      this.currentStepIndex = i;
      const step = plan.steps[i];

      // Blocked steps never execute
      if (step.risk === 'blocked') {
        this.isExecuting = false;
        const blockReason = step.guardianReason || 'Step blocked by security policy';
        this.onStopped({
          reason: blockReason,
          stepIndex: i + 1,
          totalSteps,
          step
        });
        return {
          success: false,
          reason: blockReason,
          completedSteps: i
        };
      }

      // 1. Notify listeners of live progress
      this.onProgress({
        currentStep: i + 1,
        totalSteps,
        step,
        summary: plan.summary
      });

      // 2. Owner confirmation check for 'confirm' tier steps
      if (step.risk === 'confirm' && this.requestConfirmation) {
        const confirmPromise = new Promise((resolve) => {
          this.pendingConfirmResolver = resolve;
          this.pendingConfirmTimeout = setTimeout(() => {
            this.pendingConfirmTimeout = null;
            if (this.pendingConfirmResolver === resolve) {
              this.pendingConfirmResolver = null;
              resolve({ allow: false, autoDenied: true, reason: 'Confirmation timed out (30s auto-deny)' });
            }
          }, 30000);
        });

        this.requestConfirmation(step);
        const confirmRes = await confirmPromise;

        if (!confirmRes.allow) {
          this.isExecuting = false;
          const stopReason = confirmRes.autoDenied ? 'Action auto-denied after 30s timeout' : 'Action denied by laptop owner';
          this.onStopped({
            reason: stopReason,
            stepIndex: i + 1,
            totalSteps,
            step
          });
          return {
            success: false,
            reason: stopReason,
            completedSteps: i
          };
        }
      }

      // 3. Dispatch step to helper
      const stepPromise = new Promise((resolve) => {
        this.pendingStepResolver = resolve;
        this.pendingStepTimeout = setTimeout(() => {
          this.pendingStepTimeout = null;
          if (this.pendingStepResolver === resolve) {
            this.pendingStepResolver = null;
            resolve({
              success: false,
              error: `Step ${i + 1} (${step.tool}) timed out after ${Math.round(this.stepTimeoutMs / 1000)}s`
            });
          }
        }, this.stepTimeoutMs);
      });

      this.sendToHelper({
        type: 'ai_step',
        stepId: step.id || `step-${i + 1}`,
        step
      });

      // 3. Await acknowledgment from helper
      const ack = await stepPromise;

      if (!ack.success) {
        this.isExecuting = false;
        const failureReason = ack.error || `Step ${i + 1} execution failed`;
        this.onStopped({
          reason: failureReason,
          stepIndex: i + 1,
          totalSteps,
          step
        });
        return {
          success: false,
          reason: failureReason,
          completedSteps: i
        };
      }
    }

    this.isExecuting = false;
    this.onDone({
      totalSteps,
      summary: plan.summary
    });

    return {
      success: true,
      completedSteps: totalSteps
    };
  }
}

module.exports = { PlanRunner };
