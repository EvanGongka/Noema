import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '知流 · AI 笔记',
  description: '记录不是终点，使用知识才是。'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
