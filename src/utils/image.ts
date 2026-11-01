import { SYSTEM_CONSTANTS } from '../config/constants.js';
import { AppError } from './errors.js';

export interface ValidatedImage {
  mimeType: string;
  dataBase64: string;
  byteSize: number;
}

export function validateImagePayload(imageInput: { mimeType: string; dataBase64: string }): ValidatedImage {
  const { mimeType, dataBase64 } = imageInput;

  if (!mimeType || typeof mimeType !== 'string') {
    throw new AppError('Invalid image MIME type', 'INVALID_IMAGE', 400);
  }

  const normalizedMime = mimeType.toLowerCase().trim();
  const allowed = SYSTEM_CONSTANTS.ALLOWED_IMAGE_MIME_TYPES as readonly string[];
  if (!allowed.includes(normalizedMime)) {
    throw new AppError(
      `Unsupported image format: ${normalizedMime}. Allowed formats: ${allowed.join(', ')}`,
      'INVALID_IMAGE',
      400
    );
  }

  if (!dataBase64 || typeof dataBase64 !== 'string') {
    throw new AppError('Image dataBase64 is required and must be a string', 'INVALID_IMAGE', 400);
  }

  // Calculate approximate byte size from base64 string
  const base64Clean = dataBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const byteSize = Math.floor((base64Clean.length * 3) / 4);

  if (byteSize > SYSTEM_CONSTANTS.MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      `Image size (${Math.round(byteSize / 1024 / 1024)}MB) exceeds limit of ${SYSTEM_CONSTANTS.MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`,
      'INVALID_IMAGE',
      400
    );
  }

  return {
    mimeType: normalizedMime,
    dataBase64: base64Clean,
    byteSize,
  };
}
