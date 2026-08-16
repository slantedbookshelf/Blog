import { blogProfile } from '../../src/data/profile';
import { compactKnowledge } from '../../src/lib/ai/knowledge';
import { createChatCompletion } from '../../src/lib/ai/provider';
import { buildSystemPrompt } from '../../src/lib/ai/systemPrompt';
import type { AiProviderEnv, BlogKnowledge, ChatMessage, ChatRequestBody } from '../../src/lib/ai/types';

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

interface NetlifyContext {
  ip?: string;
}

interface FunctionConfig {
  path: string;
  method: string[];
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 16;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const rateBuckets = new Map<string, number[]>();

function getEnv(name: string, fallback = '') {
  try {
    return Netlify.env.get(name) ?? fallback;
  } catch {
    return fallback;
  }
}

function parseInteger(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function getAllowedOrigins() {
  const configured = getEnv('AI_ALLOWED_ORIGINS');
  const origins = configured
    ? configured.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [
        'http://localhost:4321',
        'http://127.0.0.1:4321',
        'http://localhost:8888',
        'http://127.0.0.1:8888',
        'https://jiasuxie92-jpg.github.io'
      ];
  return new Set(origins);
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();
  const isAllowed = !origin || allowedOrigins.has(origin);

  return {
    isAllowed,
    headers: {
      'Access-Control-Allow-Origin': origin && isAllowed ? origin : Array.from(allowedOrigins)[0] ?? '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin'
    }
  };
}

function getClientKey(req: Request, context: NetlifyContext) {
  return context.ip ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
}

function isRateLimited(key: string) {
  const now = Date.now();
  const recent = (rateBuckets.get(key) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) {
    throw new Error('messages 必须是数组。');
  }

  const messages = input.slice(-MAX_HISTORY_MESSAGES).map((message) => {
    const item = message as Partial<ChatMessage>;
    const role = item.role;
    const content = typeof item.content === 'string' ? item.content.trim() : '';

    if (role !== 'user' && role !== 'assistant') {
      throw new Error('messages 中包含不支持的 role。');
    }
    if (!content) {
      throw new Error('消息内容不能为空。');
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`单条消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`);
    }

    return { role, content };
  });

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('最后一条消息必须是用户问题。');
  }

  return messages;
}

function isBlogKnowledge(value: unknown): value is BlogKnowledge {
  const item = value as Partial<BlogKnowledge>;
  return Boolean(
    item &&
    item.profile &&
    Array.isArray(item.posts) &&
    typeof item.generatedAt === 'string'
  );
}

async function loadKnowledge(req: Request): Promise<BlogKnowledge> {
  const configuredUrl = getEnv('BLOG_CONTEXT_URL') || getEnv('AI_CONTEXT_URL');
  const fallbackUrl = new URL('/ai-context.json', req.url).toString();
  const contextUrl = configuredUrl || fallbackUrl;

  try {
    const response = await fetch(contextUrl, {
      headers: {
        Accept: 'application/json'
      }
    });
    if (response.ok) {
      const payload = await response.json() as unknown;
      if (isBlogKnowledge(payload)) {
        return compactKnowledge(payload);
      }
    }
  } catch {
    // Fall through to profile-only context. The API should keep answering safely.
  }

  return {
    profile: blogProfile,
    posts: [],
    generatedAt: new Date().toISOString()
  };
}

function getProviderEnv(): AiProviderEnv {
  const apiKey = getEnv('AI_API_KEY');
  if (!apiKey) {
    throw new Error('AI_API_KEY is not configured.');
  }

  return {
    apiKey,
    baseUrl: getEnv('AI_BASE_URL', 'https://api.openai.com/v1'),
    model: getEnv('AI_MODEL', 'gpt-4o-mini'),
    maxTokens: parseInteger(getEnv('AI_MAX_TOKENS'), 700, 128, 2000)
  };
}

export default async (req: Request, context: NetlifyContext) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: cors.isAllowed ? 204 : 403,
      headers: cors.headers
    });
  }

  if (!cors.isAllowed) {
    return jsonResponse({ error: '当前来源不允许访问 AI API。' }, 403, cors.headers);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors.headers);
  }

  const clientKey = getClientKey(req, context);
  if (isRateLimited(clientKey)) {
    return jsonResponse({ error: '请求太频繁了，请稍后再试。' }, 429, cors.headers);
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json() as ChatRequestBody;
    messages = sanitizeMessages(body.messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : '请求格式不正确。';
    return jsonResponse({ error: message }, 400, cors.headers);
  }

  try {
    const knowledge = await loadKnowledge(req);
    const env = getProviderEnv();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    const answer = await createChatCompletion(
      env,
      [
        { role: 'system', content: buildSystemPrompt(knowledge) },
        ...messages
      ],
      controller.signal
    );

    clearTimeout(timeout);
    return jsonResponse({ message: answer }, 200, cors.headers);
  } catch (error) {
    const isMissingKey = error instanceof Error && error.message.includes('AI_API_KEY');
    const message = isMissingKey
      ? 'AI API 尚未配置，请稍后再试。'
      : 'AI 服务暂时不可用，请稍后再试。';
    return jsonResponse({ error: message }, isMissingKey ? 503 : 502, cors.headers);
  }
};

export const config: FunctionConfig = {
  path: '/api/chat',
  method: ['POST', 'OPTIONS']
};
