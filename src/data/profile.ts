import type { BlogProfile, BlogProject } from '../lib/ai/types';
import { SITE } from '../lib/site';

export const vibeWorks: BlogProject[] = [
  {
    name: 'smart-cockpit-agent',
    title: '多模态智能座舱 Agent',
    description: '基于 LangGraph 与 MCP 协议的智能座舱 Agent 系统，探索车载场景里的多模态交互和工具编排。',
    href: 'https://github.com/jiasuxie92-jpg/smart-cockpit-agent',
    stack: ['Python', 'LangGraph', 'MCP'],
    status: '进行中'
  },
  {
    name: 'HBTI_0427',
    title: 'HBTI 生日人格测试',
    description: '为朋友生日制作的非正式人格测试，把互动问答、结果生成和个人化表达做成轻量 Web 体验。',
    href: 'https://github.com/jiasuxie92-jpg/HBTI_0427',
    stack: ['TypeScript', 'Interactive', 'Gift'],
    status: '已完成'
  },
  {
    name: 'sleeping_simulator',
    title: '睡觉模拟器',
    description: '一个偏治愈和放松的小体验，用轻量交互营造睡眠模拟的氛围。',
    href: 'https://github.com/jiasuxie92-jpg/sleep_simulator',
    stack: ['治愈放松', '小游戏'],
    status: '已发布'
  }
];

export const blogProfile: BlogProfile = {
  name: SITE.author,
  introduction: 'SlantedBookshelf 是这个个人博客的作者，用博客记录学习、技术探索、项目复盘和与 AI 相关的实践。',
  education: [
    '北京交通大学计算机科学与技术学院信息与通信工程硕士在读'
  ],
  research: [
    '计算机视觉',
    'AI Agent',
    '多模态交互'
  ],
  interests: [
    'AI 与个人效率',
    '前端与内容型网站',
    'GitHub Pages 静态部署',
    '学习方法和技术笔记整理'
  ],
  skills: [
    'Astro',
    'TypeScript',
    'Markdown',
    'Git',
    'GitHub Actions',
    'Python',
    'Java',
    'LangGraph',
    'MCP'
  ],
  projects: vibeWorks,
  experience: [
    '维护一个基于 Astro、Markdown Content Collections 和 GitHub Pages 的个人博客',
    '正在把 AI Agent 能力应用到个人项目和博客导览体验中'
  ],
  contact: {
    github: SITE.github,
    email: SITE.email
  },
  currentFocus: [
    '完善个人博客内容与 AI 导览体验',
    '整理 Git、Astro、部署和学习方法相关笔记',
    '探索多模态智能座舱 Agent 与 MCP 工具编排'
  ],
  todos: [
    'TODO: 补充更完整的本科/硕士学习经历时间线',
    'TODO: 补充代表性课程、竞赛、实习或科研经历',
    'TODO: 补充每个项目的在线演示地址、技术难点和复盘链接'
  ]
};
