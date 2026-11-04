export const ARCHIVE_CATEGORIES = ['Java 后端', '前端开发', '人工智能', '开发工具', '算法与数据', '学习笔记'] as const;
export type ArchiveCategory = typeof ARCHIVE_CATEGORIES[number];
const legacy: Record<string, ArchiveCategory> = {
  Backend: 'Java 后端', Frontend: '前端开发', AI: '人工智能', Deployment: '开发工具',
  Database: '算法与数据', LeetCode: '算法与数据', Algorithm: '算法与数据',
  Blog: '学习笔记', Notes: '学习笔记', Security: '学习笔记'
};
export function archiveCategories(data: { category: string; categories?: ArchiveCategory[] }): ArchiveCategory[] {
  return data.categories?.length ? data.categories : [legacy[data.category] ?? '学习笔记'];
}
