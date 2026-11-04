import { defineCollection, z } from 'astro:content';
import { ARCHIVE_CATEGORIES } from '../lib/archiveCategories';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    categories: z.array(z.enum(ARCHIVE_CATEGORIES)).min(1).optional(),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    draft: z.boolean().default(false)
  })
});

export const collections = { posts };

