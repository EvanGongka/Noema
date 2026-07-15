# Noema（知流）

一款可自托管的 Markdown AI 笔记应用，界面只保留「笔记」「AI 对话」「设置」三个栏目。

[![持续集成](https://github.com/EvanGongka/Noema/actions/workflows/ci.yml/badge.svg)](https://github.com/EvanGongka/Noema/actions/workflows/ci.yml)
[![Docker 发布](https://github.com/EvanGongka/Noema/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/EvanGongka/Noema/actions/workflows/docker-publish.yml)

## 功能

- Markdown 编辑、预览、自动保存和 `.md` 文件导入
- 标题、正文、关键词和标签搜索
- 手动标签和 AI 标签建议
- 自由对话，或基于指定笔记提问、总结、优化和提取要点
- 将 AI 回答保存为新笔记或追加到已有笔记
- 自行配置 OpenAI 兼容、Anthropic、Gemini 或 Ollama 模型
- 模型密钥加密保存在当前浏览器，不写入服务端数据库

## Docker 安装

镜像已集成 Web、API、PostgreSQL/pgvector 和 Redis，不需要单独安装数据库或对象存储。

```bash
docker run -d \
  --name noema \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  -v noema-data:/data \
  gongkeao/noema:latest
```

启动后访问：

- Web：<http://localhost:3000>
- 健康检查：<http://localhost:4000/api/v1/health>
- OpenAPI：<http://localhost:4000/docs>

支持 `linux/amd64` 和 `linux/arm64`。首次启动会自动初始化数据库并执行迁移。

## Docker Compose 安装

```bash
git clone https://github.com/EvanGongka/Noema.git
cd Noema
docker compose up -d
```

查看运行状态：

```bash
docker compose ps
docker compose logs -f
```

## 首次使用

1. 打开 <http://localhost:3000> 并注册账户。
2. 进入「设置 → 模型配置」。
3. 添加自己的 AI 模型并设为默认对话模型。

没有配置模型时，笔记功能仍可正常使用，AI 对话和 AI 标签功能不可用。

## 数据与升级

使用 `docker run` 时，所有数据保存在 Docker Volume `noema-data` 中；Compose 会自动创建持久化数据卷。两种方式都将数据挂载到容器内的 `/data`，升级时保留数据卷即可。

```bash
docker pull gongkeao/noema:latest
docker rm -f noema
docker run -d \
  --name noema \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  -v noema-data:/data \
  gongkeao/noema:latest
```

Compose 部署可使用：

```bash
docker compose pull
docker compose up -d
```

## 公网部署

建议使用 Nginx、Caddy 等反向代理启用 HTTPS，并设置真实访问地址：

```bash
docker run -d \
  --name noema \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  -v noema-data:/data \
  -e WEB_URL=https://notes.example.com \
  -e COOKIE_SECURE=true \
  gongkeao/noema:latest
```

| 环境变量                     | 默认值                  | 说明                               |
| ---------------------------- | ----------------------- | ---------------------------------- |
| `WEB_URL`                    | `http://localhost:3000` | Web 端真实访问地址                 |
| `COOKIE_SECURE`              | 自动判断                | 是否启用 Secure Cookie             |
| `ALLOW_PRIVATE_AI_ENDPOINTS` | `false`                 | 是否允许访问 Ollama 等内网模型地址 |
| `ENABLE_AI_WORKER`           | `false`                 | 是否启用可选后台 AI Worker         |

## 使用 Ollama

Ollama 运行在 Docker 宿主机时，将模型地址配置为：

```text
http://host.docker.internal:11434
```

同时设置 `ALLOW_PRIVATE_AI_ENDPOINTS=true`。Linux 还需要为容器增加：

```bash
--add-host=host.docker.internal:host-gateway
```

## 镜像与源码

- Docker Hub：<https://hub.docker.com/r/gongkeao/noema>
- GitHub：<https://github.com/EvanGongka/Noema>
- `latest`：最新版本
- `sha-*`：与 GitHub 提交对应的固定版本
