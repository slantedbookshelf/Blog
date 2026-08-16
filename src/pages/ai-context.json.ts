import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { blogProfile } from '../data/profile';
import { getPostSlug, withBase } from '../lib/site';
import type { BlogKnowledge } from '../lib/ai/types';

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

export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
    .map((post) => {
      const slug = getPostSlug(post.id);
      return {
        title: post.data.title,
        description: post.data.description,
        category: post.data.category,
        tags: post.data.tags,
        slug,
        pubDate: post.data.pubDate.toISOString(),
        url: withBase(`/posts/${slug}/`),
        excerpt: toPlainText(post.body).slice(0, 700)
      };
    });

  const knowledge: BlogKnowledge = {
    profile: blogProfile,
    posts,
    generatedAt: new Date().toISOString()
  };

  return new Response(JSON.stringify(knowledge), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
