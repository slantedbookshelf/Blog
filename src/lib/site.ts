export const SITE = {
  title: 'My Blog',
  author: 'Your Name',
  description: 'A quiet place for notes, essays, and technical experiments.',
  github: 'https://github.com/your-username',
  email: 'mailto:you@example.com',
  location: 'Somewhere on Earth'
};

export function withBase(path = '/') {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath === '/') {
    return base || '/';
  }

  return `${normalizedBase}${normalizedPath}`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function getPostSlug(id: string) {
  return id.replace(/\.mdx?$/, '').replace(/\/index$/, '');
}
