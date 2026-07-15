"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {source || "*还没有正文。*"}
      </ReactMarkdown>
    </div>
  );
}
