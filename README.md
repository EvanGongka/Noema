# 知流 · Markdown AI 笔记

知流是一个精简的 Markdown AI 笔记工具，工作区只保留“笔记、AI 对话、设置”三个栏目。

## 功能

- Markdown 编辑、预览、自动保存、导入、删除和快捷格式工具；
- 标题、正文、关键词和标签搜索；
- 手动标签和 AI 标签建议；
- 自由 AI 对话，以及基于指定笔记的提问、总结和优化；
- 将 AI 回答新建为笔记或追加到已有笔记；
- 用户自行配置 OpenAI 兼容、Anthropic、Gemini 或 Ollama 模型；
- 模型密钥仅加密保存在当前浏览器，不写入服务端数据库。

## 使用 Docker 直接部署

镜像已经包含 Web、API、PostgreSQL/pgvector、Redis 和可选 AI Worker，不需要额外启动数据库或对象存储。默认只向宿主机开放 Web 端口 `3000` 和 API 端口 `4000`。

```bash
docker run -d \
  --name zhil \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  -v zhil-data:/data \
  gongkeao/noema:latest
```

启动后访问：

- Web：<http://localhost:3000>
- API 健康检查：<http://localhost:4000/api/v1/health>
- OpenAPI：<http://localhost:4000/docs>

也可以使用 Compose：

```bash
docker compose up -d
```

数据统一保存在 `/data`。升级镜像时保留同一个 `zhil-data` 数据卷即可：

```bash
docker pull gongkeao/noema:latest
docker rm -f zhil
docker run -d --name zhil --restart unless-stopped \
  -p 3000:3000 -p 4000:4000 \
  -v zhil-data:/data \
  gongkeao/noema:latest
```

## 部署配置

公网部署时建议通过 Nginx、Caddy 或其他反向代理启用 HTTPS，并传入真实访问地址：

```bash
docker run -d \
  --name zhil \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  -v zhil-data:/data \
  -e WEB_URL=https://notes.example.com \
  -e COOKIE_SECURE=true \
  gongkeao/noema:latest
```

常用环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `WEB_URL` | `http://localhost:3000` | 允许访问 API 的 Web 来源；HTTPS 地址也会自动启用安全 Cookie |
| `COOKIE_SECURE` | 自动判断 | 显式设为 `true` 或 `false` 控制 Secure Cookie |
| `ALLOW_PRIVATE_AI_ENDPOINTS` | `false` | 允许服务端访问 Ollama 等内网模型地址 |
| `ENABLE_AI_WORKER` | `false` | 启用旧版后台分析作业处理器 |

若 Ollama 运行在 Docker 宿主机，可把模型地址配置为 `http://host.docker.internal:11434`，并设置 `ALLOW_PRIVATE_AI_ENDPOINTS=true`。Linux 使用 `docker run` 时还需增加 `--add-host=host.docker.internal:host-gateway`。

## 为什么没有 MinIO

当前版本没有附件或图片识别功能，Markdown 导入内容直接进入 PostgreSQL，因此 MinIO 和 S3 SDK 已从运行时移除。数据库中原有兼容字段仍然保留，不执行破坏性迁移。

## 本地开发与构建

环境要求：Node.js 22、pnpm 11、Docker。

```bash
pnpm install
pnpm dev
pnpm check
docker build -t ai-note:local .
```

Docker Hub 镜像由 GitHub Actions 在 `main` 分支和 `v*` 标签推送时自动构建，支持 `linux/amd64` 与 `linux/arm64`。
