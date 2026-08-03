import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { SITE, getPostSlug } from '../lib/site';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ?? new URL('https://jiasuxie92-jpg.github.io/');
  const posts = (await getCollection('posts', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  const items = posts.map((post) => {
    const url = new URL(`/posts/${getPostSlug(post.id)}/`, baseUrl).toString();
    return `
      <item>
        <title>${escapeXml(post.data.title)}</title>
        <link>${url}</link>
        <guid>${url}</guid>
        <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
        <description>${escapeXml(post.data.description)}</description>
      </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>${escapeXml(SITE.title)}</title>
        <link>${baseUrl.toString()}</link>
        <description>${escapeXml(SITE.description)}</description>
        <language>zh-CN</language>
        ${items}
      </channel>
    </rss>`;

  return new Response(xml.trim(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8'
    }
  });
};
