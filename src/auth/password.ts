import { verifyAuthPassword } from './simple-auth.js';

export async function verifyApplicationPassword(password: string): Promise<boolean> {
  return verifyAuthPassword(password);
}

export async function hashPassword(plainText: string): Promise<string> {
  return plainText;
}
