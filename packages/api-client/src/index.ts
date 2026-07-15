import type { ApiErrorPayload } from '@ai-note/shared';

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly payload: ApiErrorPayload) {
    super(payload.message);
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ code: 'HTTP_ERROR', message: response.statusText }))) as ApiErrorPayload;
      throw new ApiClientError(response.status, payload);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async *stream<T>(path: string, init: RequestInit = {}): AsyncGenerator<{ event: string; data: T }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...init.headers }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ code: 'HTTP_ERROR', message: response.statusText }))) as ApiErrorPayload;
      throw new ApiClientError(response.status, payload);
    }
    if (!response.body) throw new ApiClientError(502, { code: 'EMPTY_STREAM', message: '服务器没有返回数据流' });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        let event = 'message'; const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).trim());
        }
        if (data.length) yield { event, data: JSON.parse(data.join('\n')) as T };
      }
      if (done) break;
    }
  }
}

export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL ?? '/api/v1');
