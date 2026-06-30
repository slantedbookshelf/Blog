// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const site = process.env.SITE_URL ?? 'https://your-username.github.io';
const base = process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS && repoName ? `/${repoName}` : '/');

export default defineConfig({
  site,
  base,
  integrations: [sitemap()],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark',
      wrap: true
    }
  }
});
