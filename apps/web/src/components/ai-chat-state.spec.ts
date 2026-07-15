import { describe, expect, it } from 'vitest';
import { upsertByCandidateIds } from './ai-chat-state';

interface Message {
  id: string;
  content: string;
  status: string;
}

describe('AI 对话流状态', () => {
  it('临时消息被并发详情请求覆盖后仍能恢复增量回答', () => {
    const messages = upsertByCandidateIds<Message>(
      [],
      ['server-message', 'temporary-message'],
      () => ({ id: 'server-message', content: '', status: 'STREAMING' }),
      (message) => ({ ...message, content: `${message.content}你好`, status: 'STREAMING' })
    );

    expect(messages).toEqual([{ id: 'server-message', content: '你好', status: 'STREAMING' }]);
  });

  it('服务端消息 ID 能接管临时消息并继续累加内容', () => {
    const renamed = upsertByCandidateIds<Message>(
      [{ id: 'temporary-message', content: '', status: 'STREAMING' }],
      ['temporary-message', 'server-message'],
      () => ({ id: 'server-message', content: '', status: 'STREAMING' }),
      (message) => ({ ...message, id: 'server-message' })
    );
    const completed = upsertByCandidateIds<Message>(
      renamed,
      ['server-message', 'temporary-message'],
      () => ({ id: 'server-message', content: '', status: 'STREAMING' }),
      (message) => ({ ...message, content: '你好！有什么可以帮你的吗？', status: 'COMPLETED' })
    );

    expect(completed).toEqual([{ id: 'server-message', content: '你好！有什么可以帮你的吗？', status: 'COMPLETED' }]);
  });
});
