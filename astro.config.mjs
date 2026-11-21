// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const site = process.env.SITE_URL ?? 'https://your-username.github.io';
const base = process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS && repoName ? `/${repoName}` : '/');
const basePrefix = base.replace(/\/$/, '');

export default defineConfig({
  site,
  base,
  redirects: {
    '/posts/hot_100': `${basePrefix}/practice/hot_100/`,
    '/posts/sql_50': `${basePrefix}/practice/sql_50/`
  },
  integrations: [sitemap()],
  vite: {
    optimizeDeps: {
      // The practice workspace imports these only after the editor opens.
      include: [
        'monaco-editor/esm/vs/editor/editor.api',
        'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching',
        'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution',
        'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController',
        'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode',
        'monaco-editor/esm/vs/language/typescript/monaco.contribution',
        'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution',
        'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution',
        'monaco-editor/esm/vs/basic-languages/go/go.contribution'
      ]
    }
  },
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark',
      wrap: true
    }
  }
});
