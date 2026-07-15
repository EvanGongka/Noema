"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@ai-note/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.request("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      router.push("/workspace");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "注册失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand">
        <span>知</span>知流
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <div>
          <small>简单开始</small>
          <h1>创建账户</h1>
          <p>先写一篇 Markdown 笔记，再按需要连接自己的 AI 模型。</p>
        </div>
        <label>
          称呼
          <input name="name" required maxLength={80} placeholder="你的名字" />
        </label>
        <label>
          邮箱
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@example.com"
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            placeholder="至少 8 位"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? "正在创建…" : "创建账户"}
        </button>
        <p className="auth-switch">
          已有账户？<Link href="/login">直接登录</Link>
        </p>
      </form>
    </main>
  );
}
