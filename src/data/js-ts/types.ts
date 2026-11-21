export type Language = 'javascript' | 'typescript' | 'go';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Lesson {
  id: string;
  title: string;
  concept: string;
  comparison: string;
  pitfall: string;
  example: string;
}

export interface Chapter {
  title: string;
  description: string;
  language: Language;
  lessons: Lesson[];
}

export interface Exercise {
  title: string;
  difficulty: '入门' | '基础' | '进阶';
  task: string;
  constraints: string;
  hint: string;
  explanation: string;
  starter: string;
  solution: string;
}

export interface TestCase {
  args: Json[];
  expected: Json;
}

export const lesson = (id: string, title: string, concept: string, comparison: string, pitfall: string, example: string): Lesson =>
  ({ id, title, concept, comparison, pitfall, example });
