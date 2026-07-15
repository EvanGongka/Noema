'use client';

import { api } from '@ai-note/api-client';

export interface TemporaryCredential {
  configId: string;
  apiKey: string;
}

interface ProviderMetadata {
  id: string;
  provider: 'OPENAI_COMPATIBLE' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA';
  isDefaultChat: boolean;
  isDefaultEmbedding: boolean;
}

const databaseName = 'zhiliu-local-ai-v1';
const databaseVersion = 1;
const keyStoreName = 'device-keys';
const credentialStoreName = 'credentials';
const encryptionKeyId = 'aes-gcm-device-key';

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机密钥库访问失败'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(keyStoreName)) database.createObjectStore(keyStoreName, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(credentialStoreName)) database.createObjectStore(credentialStoreName, { keyPath: 'configId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本机密钥库'));
  });
}

async function deviceKey(database: IDBDatabase): Promise<CryptoKey> {
  const existing = await requestValue<{ id: string; key: CryptoKey } | undefined>(database.transaction(keyStoreName).objectStore(keyStoreName).get(encryptionKeyId));
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await requestValue(database.transaction(keyStoreName, 'readwrite').objectStore(keyStoreName).put({ id: encryptionKeyId, key }));
  return key;
}

export async function saveLocalCredential(configId: string, apiKey: string): Promise<void> {
  if (!apiKey) return;
  const database = await openDatabase();
  try {
    const key = await deviceKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
    const transaction = database.transaction(credentialStoreName, 'readwrite');
    await requestValue(transaction.objectStore(credentialStoreName).put({ configId, iv: iv.buffer, encrypted, updatedAt: new Date().toISOString() }));
  } finally { database.close(); }
}

export async function readLocalCredential(configId: string): Promise<string | undefined> {
  const database = await openDatabase();
  try {
    const record = await requestValue<{ configId: string; iv: ArrayBuffer; encrypted: ArrayBuffer } | undefined>(database.transaction(credentialStoreName).objectStore(credentialStoreName).get(configId));
    if (!record) return undefined;
    const key = await deviceKey(database);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, key, record.encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    return undefined;
  } finally { database.close(); }
}

export async function deleteLocalCredential(configId: string): Promise<void> {
  const database = await openDatabase();
  try { await requestValue(database.transaction(credentialStoreName, 'readwrite').objectStore(credentialStoreName).delete(configId)); }
  finally { database.close(); }
}

export async function hasLocalCredential(configId: string): Promise<boolean> {
  return Boolean(await readLocalCredential(configId));
}

export async function credentialsForRequest(options: {
  chatConfigId?: string;
  includeDefaultChat?: boolean;
  includeDefaultEmbedding?: boolean;
}): Promise<TemporaryCredential[]> {
  const configs = await api.request<ProviderMetadata[]>('/ai/providers');
  const ids = new Set<string>();
  if (options.chatConfigId) ids.add(options.chatConfigId);
  if (options.includeDefaultChat) {
    const config = configs.find((item) => item.isDefaultChat);
    if (config) ids.add(config.id);
  }
  if (options.includeDefaultEmbedding) {
    const config = configs.find((item) => item.isDefaultEmbedding);
    if (config) ids.add(config.id);
  }
  const selected = configs.filter((item) => ids.has(item.id)).slice(0, 2);
  const credentials = await Promise.all(selected.map(async (config) => {
    const apiKey = await readLocalCredential(config.id);
    return apiKey ? { configId: config.id, apiKey } : undefined;
  }));
  return credentials.filter((item): item is TemporaryCredential => Boolean(item));
}
