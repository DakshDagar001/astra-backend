export const SYSTEM_CONSTANTS = {
  APP_NAME: 'Astra AI Backend',
  API_VERSION: 'v1',
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_REQUEST_TIMEOUT_MS: 30000,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_PROMPT_LENGTH: 65536,
  ALLOWED_IMAGE_MIME_TYPES: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ] as const,
  AUTH_HEADER_PREFIX: 'Bearer ',
  HEADER_CORRELATION_ID: 'x-correlation-id',
  HEADER_DEVICE_ID: 'x-device-id',
  HEADER_DEVICE_NAME: 'x-device-name',
  HEADER_CLIENT_TYPE: 'x-client-type',
  HEADER_CLIENT_VERSION: 'x-client-version',
};
