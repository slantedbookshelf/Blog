import type { AiProviderEnv, ChatMessage } from './types';

interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionChoice {
  message?: {
    role?: string;
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  error?: {
    message?: string;
  };
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export async function createChatCompletion(
  env: AiProviderEnv,
  messages: ProviderMessage[],
  signal?: AbortSignal
): Promise<ChatMessage> {
  const endpoint = `${env.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.model,
      messages,
      temperature: 0.2,
      max_tokens: env.maxTokens
    }),
    signal
  });

  let payload: ChatCompletionResponse | undefined;
  try {
    payload = await response.json() as ChatCompletionResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw new AiProviderError(payload?.error?.message ?? 'AI 服务暂时不可用。', response.status);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AiProviderError('AI 服务返回了空回答。');
  }

  return {
    role: 'assistant',
    content
  };
}
