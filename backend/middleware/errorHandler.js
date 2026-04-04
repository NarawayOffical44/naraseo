/**
 * Error Handler Utility - User-friendly error messages with detailed logging
 * Maps technical errors to readable messages + logs for debugging
 */

// Circuit breaker for Claude API
class CircuitBreaker {
  constructor(threshold = 5, resetTimeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttemptMs: this.state === 'OPEN' ? Math.max(0, this.nextAttempt - Date.now()) : 0,
    };
  }
}

// Error type classifier
function classifyError(error) {
  const message = error.message || '';
  const code = error.code || '';

  if (message.includes('timeout') || code === 'ETIMEDOUT') {
    return { type: 'TIMEOUT', userMessage: 'Request took too long. Please try again.' };
  }
  if (message.includes('ECONNRESET') || code === 'ECONNRESET') {
    return { type: 'NETWORK_ERROR', userMessage: 'Network connection lost. Please check your connection and try again.' };
  }
  if (message.includes('ENOTFOUND') || code === 'ENOTFOUND') {
    return { type: 'DNS_ERROR', userMessage: 'Could not reach the requested server. Please verify the URL.' };
  }
  if (message.includes('429') || code === '429') {
    return { type: 'RATE_LIMIT', userMessage: 'Service busy. Please retry in a moment.' };
  }
  if (message.includes('Circuit breaker')) {
    return { type: 'SERVICE_UNAVAILABLE', userMessage: 'AI service temporarily unavailable. Please retry in 1 minute.' };
  }
  if (message.includes('HTTP 5') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return { type: 'SERVER_ERROR', userMessage: 'Server error. Service recovering. Please retry shortly.' };
  }
  if (message.includes('HTTP 4')) {
    return { type: 'CLIENT_ERROR', userMessage: 'Invalid request format. Check parameters.' };
  }
  if (message.includes('too large') || message.includes('large')) {
    return { type: 'PAYLOAD_TOO_LARGE', userMessage: 'Content too large. Please reduce input size.' };
  }

  return { type: 'UNKNOWN', userMessage: 'An error occurred. Please try again.' };
}

// Enhanced error logging with context
function logError(error, context = {}) {
  const { type, userMessage } = classifyError(error);
  const timestamp = new Date().toISOString();

  console.error(`[${timestamp}] ERROR [${type}]`, {
    message: error.message,
    code: error.code,
    stack: error.stack,
    context,
  });

  return { type, userMessage };
}

// Format error response for API
function formatErrorResponse(error, context = {}) {
  const { type, userMessage } = logError(error, context);

  return {
    success: false,
    error: {
      type,
      message: userMessage,
      userFriendly: true,
      timestamp: new Date().toISOString(),
    },
  };
}

export { CircuitBreaker, classifyError, logError, formatErrorResponse };
