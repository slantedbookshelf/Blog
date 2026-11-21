import { getCollection, type CollectionEntry } from 'astro:content';
import type { APIRoute } from 'astro';
import { blogProfile } from '../data/profile';
import { getPostSlug, withBase } from '../lib/site';
import type { BlogKnowledge, PracticeSummary } from '../lib/ai/types';

function toPlainText(markdown = '') {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(entry: CollectionEntry<'posts' | 'practice'>, slug: string, url: string): PracticeSummary {
  return {
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    slug,
    pubDate: entry.data.pubDate.toISOString(),
    url: withBase(url),
    excerpt: toPlainText(entry.body).slice(0, 700)
  };
}

export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
    .map((post) => {
      const slug = getPostSlug(post.id);
      return {
        ...summarize(post, slug, `/posts/${slug}/`),
        category: post.data.category
      };
    });
  const practice = (await getCollection('practice', ({ data }) => !data.draft))
    .sort((a, b) => a.data.pubDate.getTime() - b.data.pubDate.getTime())
    .map((guide) => summarize(guide, guide.slug, `/practice/${guide.slug}/`));

  const knowledge: BlogKnowledge = {
    profile: blogProfile,
    posts,
    practice,
    generatedAt: new Date().toISOString()
  };

  return new Response(JSON.stringify(knowledge), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
