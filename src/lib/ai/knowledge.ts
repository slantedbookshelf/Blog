import type { BlogKnowledge, PracticeSummary } from './types';

function compactEntries<T extends PracticeSummary>(entries: T[]) {
  return entries.map((entry) => ({
    ...entry,
    excerpt: entry.excerpt?.slice(0, 700)
  }));
}

export function compactKnowledge(knowledge: BlogKnowledge): BlogKnowledge {
  return {
    profile: knowledge.profile,
    generatedAt: knowledge.generatedAt,
    posts: compactEntries(knowledge.posts),
    practice: Array.isArray(knowledge.practice) ? compactEntries(knowledge.practice) : []
  };
}
