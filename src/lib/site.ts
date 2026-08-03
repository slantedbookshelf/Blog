export const SITE = {
  title: "SlantedBookshelf",
  author: 'SlantedBookshelf',
  description: '倾斜书架，记录一下！',
  github: 'https://github.com/jiasuxie92-jpg',
  email: 'mailto:13137112415@163.com',
  location: '北京交通大学',
  university: '北京交通大学',
  startDate: '2026-06-29'
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
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getPostSlug(id: string) {
  return id.replace(/\.mdx?$/, '').replace(/\/index$/, '');
}

export function estimateReadingTime(text = '') {
  const cjkChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const weightedUnits = cjkChars + latinWords * 2;
  return Math.max(1, Math.ceil(weightedUnits / 500));
}

export function daysSince(dateString: string) {
  const start = new Date(`${dateString}T00:00:00+08:00`).getTime();
  const now = Date.now();
  return Math.max(1, Math.ceil((now - start) / 86_400_000));
}
