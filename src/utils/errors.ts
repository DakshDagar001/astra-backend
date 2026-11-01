export type ErrorCategory =
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'BILLING_LIMIT_REACHED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_PROVIDER_CREDENTIALS'
  | 'INVALID_REQUEST'
  | 'INVALID_IMAGE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'CONTENT_POLICY_REFUSAL'
  | 'AUTHENTICATION_ERROR'
  | 'UNKNOWN_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly category: ErrorCategory;
  public readonly isOperational: boolean;
  public readonly retryAfterSeconds?: number;
  public readonly details?: any;

  constructor(
    message: string,
    category: ErrorCategory = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    retryAfterSeconds?: number,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Invalid credentials') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'AUTHENTICATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class InvalidRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'INVALID_REQUEST', 400, undefined, details);
    this.name = 'InvalidRequestError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfterSeconds = 60) {
    super(message, 'RATE_LIMITED', 429, retryAfterSeconds);
    this.name = 'RateLimitError';
  }
}

export class QuotaExhaustedError extends AppError {
  constructor(message = 'Provider quota exhausted') {
    super(message, 'QUOTA_EXHAUSTED', 429, 3600);
    this.name = 'QuotaExhaustedError';
  }
}
