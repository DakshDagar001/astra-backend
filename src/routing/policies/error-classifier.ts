import { ErrorCategory } from '../../utils/errors.js';

export class ErrorClassifier {
  /**
   * Errors that are eligible for fallback to the next candidate model
   */
  static isFallbackEligible(category: ErrorCategory): boolean {
    switch (category) {
      case 'RATE_LIMITED':
      case 'QUOTA_EXHAUSTED':
      case 'BILLING_LIMIT_REACHED':
      case 'PROVIDER_UNAVAILABLE':
      case 'PROVIDER_SERVER_ERROR':
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
      case 'MODEL_UNAVAILABLE':
        return true;
      case 'INVALID_REQUEST':
      case 'INVALID_IMAGE':
      case 'AUTHENTICATION_ERROR':
      case 'INVALID_PROVIDER_CREDENTIALS':
      case 'UNSUPPORTED_CAPABILITY':
      case 'CONTENT_POLICY_REFUSAL':
      case 'UNKNOWN_ERROR':
      default:
        return false;
    }
  }

  /**
   * Errors that should be retried on the SAME model before attempting fallback
   */
  static isRetryableOnSameModel(category: ErrorCategory): boolean {
    switch (category) {
      case 'PROVIDER_SERVER_ERROR':
      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        return true;
      default:
        return false;
    }
  }
}
