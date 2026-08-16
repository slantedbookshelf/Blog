import type { BlogKnowledge } from './types';

export function compactKnowledge(knowledge: BlogKnowledge): BlogKnowledge {
  return {
    profile: knowledge.profile,
    generatedAt: knowledge.generatedAt,
    posts: knowledge.posts.map((post) => ({
      ...post,
      excerpt: post.excerpt?.slice(0, 700)
    }))
  };
}
