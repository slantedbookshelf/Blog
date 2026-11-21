import { defineCollection, z } from 'astro:content';
import { ARCHIVE_CATEGORIES } from '../lib/archiveCategories';

const contentSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false)
});

const posts = defineCollection({
  type: 'content',
  schema: contentSchema.extend({
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    categories: z.array(z.enum(ARCHIVE_CATEGORIES)).min(1).optional(),
    pinned: z.boolean().default(false)
  })
});

const practice = defineCollection({
  type: 'content',
  schema: contentSchema
});

export const collections = { posts, practice };

