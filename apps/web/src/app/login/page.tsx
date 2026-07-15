"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@ai-note/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.request("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      router.push("/workspace");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
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
          <small>欢迎回来</small>
          <h1>登录知流</h1>
          <p>继续写笔记，或和自己的 AI 模型对话。</p>
        </div>
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
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? "正在登录…" : "登录"}
        </button>
        <p className="auth-switch">
          还没有账户？<Link href="/register">创建账户</Link>
        </p>
      </form>
    </main>
  );
}
