import Link from "next/link";
import {
  ArrowRight,
  KeyRound,
  MessageSquareText,
  NotebookPen,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="brand-mark">知</div>
        <strong>知流</strong>
        <Link href="/login" className="text-link">
          登录
        </Link>
      </nav>
      <section className="hero">
        <div className="eyebrow">
          <Sparkles size={14} /> 简单的 Markdown AI 笔记
        </div>
        <h1>
          写笔记，和 AI 对话，
          <br />
          <em>仅此而已。</em>
        </h1>
        <p>
          用 Markdown 保留自己的内容，选择一篇笔记向 AI
          提问、总结或优化，再把有用的回答整理回笔记。
        </p>
        <div className="hero-actions">
          <Link href="/register" className="primary-link">
            开始使用 <ArrowRight size={17} />
          </Link>
          <Link href="/login" className="secondary-link">
            进入知流
          </Link>
        </div>
      </section>
      <section className="feature-grid">
        <article>
          <NotebookPen />
          <h2>Markdown 笔记</h2>
          <p>编辑、预览、导入和关键词搜索，所有内容保持简单透明。</p>
        </article>
        <article>
          <MessageSquareText />
          <h2>AI 对话</h2>
          <p>自由聊天，或基于选定笔记进行提问、总结与优化。</p>
        </article>
        <article>
          <KeyRound />
          <h2>自己的模型</h2>
          <p>只连接你配置的模型，API Key 仅保存在当前设备。</p>
        </article>
      </section>
    </main>
  );
}
