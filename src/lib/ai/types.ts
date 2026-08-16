export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: Exclude<ChatRole, 'system'>;
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
}

export interface ChatResponseBody {
  message: ChatMessage;
}

export interface BlogProject {
  name: string;
  title: string;
  description: string;
  href: string;
  stack: string[];
  status?: string;
}

export interface BlogProfile {
  name: string;
  introduction: string;
  education: string[];
  research: string[];
  interests: string[];
  skills: string[];
  projects: BlogProject[];
  experience: string[];
  contact: {
    github: string;
    email: string;
  };
  currentFocus: string[];
  todos: string[];
}

export interface BlogPostSummary {
  title: string;
  description: string;
  category: string;
  tags: string[];
  slug: string;
  pubDate: string;
  url: string;
  excerpt?: string;
}

export interface BlogKnowledge {
  profile: BlogProfile;
  posts: BlogPostSummary[];
  generatedAt: string;
}

export interface AiProviderEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}
