import { ModelGatewayError } from './types';

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export async function requestJson(url: string, init: RequestInit, timeoutMs = 60_000): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ModelGatewayError(error instanceof Error ? error.message : '模型网络请求失败', 'MODEL_NETWORK_ERROR', true);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ModelGatewayError(`模型网关调用失败：HTTP ${response.status}${detail ? ` - ${detail}` : ''}`, 'MODEL_HTTP_ERROR', response.status === 408 || response.status === 429 || response.status >= 500, response.status);
  }
  return response.json();
}

export async function requestStream(url: string, init: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ModelGatewayError(error instanceof Error ? error.message : '模型网络请求失败', 'MODEL_NETWORK_ERROR', true);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ModelGatewayError(`模型网关调用失败：HTTP ${response.status}${detail ? ` - ${detail}` : ''}`, 'MODEL_HTTP_ERROR', response.status === 408 || response.status === 429 || response.status >= 500, response.status);
  }
  if (!response.body) throw new ModelGatewayError('模型响应没有可读取的数据流', 'EMPTY_MODEL_STREAM', true);
  return response;
}

export async function* lines(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const line of parts) if (line.trim()) yield line.trim();
      if (done) break;
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}

export async function* sseData(response: Response): AsyncGenerator<string> {
  for await (const line of lines(response)) {
    if (line.startsWith('data:')) yield line.slice(5).trim();
  }
}
