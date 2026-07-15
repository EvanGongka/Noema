import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function parseKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[a-f\d]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY 必须是 32 字节的十六进制或 Base64 密钥');
  return key;
}

export function encryptCredential(plainText: string, masterKey = process.env.AI_CREDENTIAL_ENCRYPTION_KEY): string {
  if (!masterKey) throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY 未配置');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', parseKey(masterKey), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptCredential(payload: string, masterKey = process.env.AI_CREDENTIAL_ENCRYPTION_KEY): string {
  if (!masterKey) throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY 未配置');
  const [version, ivText, tagText, encryptedText] = payload.split('.');
  if (version !== VERSION || !ivText || !tagText || !encryptedText) throw new Error('模型凭据格式无效');
  const decipher = createDecipheriv('aes-256-gcm', parseKey(masterKey), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskCredential(value?: string | null): string | null {
  if (!value) return null;
  return value.length <= 8 ? '••••••••' : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}
