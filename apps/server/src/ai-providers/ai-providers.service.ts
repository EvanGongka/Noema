import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AiProviderConfig, Prisma } from "@prisma/client";
import {
  createModelGateway,
  type GatewayConfig,
  type ModelGateway,
} from "@ai-note/ai-core";
import type {
  ProviderConfigInput,
  ProviderConfigPatchInput,
  TemporaryCredentialInput,
} from "@ai-note/schemas";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isPrivateAddress } from "./endpoint-security";

interface ResolvedGateway {
  gateway: ModelGateway;
  config: AiProviderConfig | null;
}

@Injectable()
export class AiProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const configs = await this.prisma.aiProviderConfig.findMany({
      where: { userId },
      orderBy: [{ isDefaultChat: "desc" }, { createdAt: "asc" }],
    });
    return configs.map((config) => this.publicConfig(config));
  }

  async create(user: AuthContext, input: ProviderConfigInput) {
    await this.validateEndpoint(input.baseUrl);
    const created = await this.prisma.$transaction(async (tx) => {
      if (input.isDefaultChat)
        await tx.aiProviderConfig.updateMany({
          where: { userId: user.userId },
          data: { isDefaultChat: false },
        });
      if (input.isDefaultEmbedding)
        await tx.aiProviderConfig.updateMany({
          where: { userId: user.userId },
          data: { isDefaultEmbedding: false },
        });
      const existingCount = await tx.aiProviderConfig.count({
        where: { userId: user.userId },
      });
      const config = await tx.aiProviderConfig.create({
        data: {
          userId: user.userId,
          provider: input.provider,
          name: input.name,
          baseUrl: this.normalizeUrl(input.baseUrl),
          chatModel: input.chatModel,
          embeddingModel: input.embeddingModel || null,
          enabled: input.enabled,
          isDefaultChat: input.isDefaultChat || existingCount === 0,
          isDefaultEmbedding:
            Boolean(input.embeddingModel) &&
            (input.isDefaultEmbedding || existingCount === 0),
          capabilities: { apiMode: input.apiMode ?? "CHAT_COMPLETIONS" },
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.userId,
          action: "AI_PROVIDER_CREATED",
          targetType: "AI_PROVIDER",
          targetId: config.id,
          metadata: { provider: input.provider, name: input.name },
        },
      });
      return config;
    });
    return this.publicConfig(created);
  }

  async update(user: AuthContext, id: string, input: ProviderConfigPatchInput) {
    const current = await this.findOwned(user.userId, id);
    const baseUrl = input.baseUrl ?? current.baseUrl;
    await this.validateEndpoint(baseUrl);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDefaultChat)
        await tx.aiProviderConfig.updateMany({
          where: { userId: user.userId, id: { not: id } },
          data: { isDefaultChat: false },
        });
      if (input.isDefaultEmbedding)
        await tx.aiProviderConfig.updateMany({
          where: { userId: user.userId, id: { not: id } },
          data: { isDefaultEmbedding: false },
        });
      const config = await tx.aiProviderConfig.update({
        where: { id },
        data: {
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.baseUrl
            ? { baseUrl: this.normalizeUrl(input.baseUrl) }
            : {}),
          ...(input.chatModel ? { chatModel: input.chatModel } : {}),
          ...(input.embeddingModel !== undefined
            ? { embeddingModel: input.embeddingModel || null }
            : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.isDefaultChat !== undefined
            ? { isDefaultChat: input.isDefaultChat }
            : {}),
          ...(input.isDefaultEmbedding !== undefined
            ? { isDefaultEmbedding: input.isDefaultEmbedding }
            : {}),
          ...(input.apiMode
            ? { capabilities: { apiMode: input.apiMode } }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.userId,
          action: "AI_PROVIDER_UPDATED",
          targetType: "AI_PROVIDER",
          targetId: id,
          metadata: { fields: Object.keys(input) },
        },
      });
      return config;
    });
    return this.publicConfig(updated);
  }

  async remove(user: AuthContext, id: string) {
    await this.findOwned(user.userId, id);
    await this.prisma.$transaction([
      this.prisma.aiProviderConfig.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.userId,
          action: "AI_PROVIDER_DELETED",
          targetType: "AI_PROVIDER",
          targetId: id,
        },
      }),
    ]);
    return { ok: true };
  }

  async test(
    userId: string,
    id: string,
    credentials: TemporaryCredentialInput[],
  ) {
    const { gateway } = await this.resolve(userId, id, "chat", credentials);
    const result = await gateway.testConnection();
    await this.prisma.aiProviderConfig.updateMany({
      where: { id, userId },
      data: { lastValidatedAt: new Date() },
    });
    return result;
  }

  async models(
    userId: string,
    id: string,
    credentials: TemporaryCredentialInput[],
  ) {
    const { gateway } = await this.resolve(userId, id, "chat", credentials);
    return { models: await gateway.listModels() };
  }

  async resolve(
    userId: string,
    id?: string | null,
    purpose: "chat" | "embedding" = "chat",
    credentials: TemporaryCredentialInput[] = [],
  ): Promise<ResolvedGateway> {
    await this.validateCredentials(userId, credentials);
    const config = await this.selectConfiguration(userId, id, purpose);
    if (!config) {
      if (process.env.NODE_ENV === "test")
        return { gateway: createModelGateway(), config: null };
      throw new BadRequestException({
        code: "AI_MODEL_CONFIGURATION_REQUIRED",
        message: "请先在设置中配置可用的 AI 模型",
      });
    }
    if (purpose === "embedding" && !config.embeddingModel)
      throw new BadRequestException("默认模型没有配置嵌入模型");
    const credential = credentials.find((item) => item.configId === config.id);
    if (config.provider !== "OLLAMA" && !credential?.apiKey) {
      throw new BadRequestException({
        code: "AI_CREDENTIAL_REQUIRED",
        message: `当前设备尚未配置“${config.name}”的模型密钥`,
      });
    }
    return {
      gateway: createModelGateway(
        this.gatewayConfig(config, credential?.apiKey),
      ),
      config,
    };
  }

  async configuration(userId: string, id: string) {
    return this.findOwned(userId, id);
  }

  async selectConfiguration(
    userId: string,
    id?: string | null,
    purpose: "chat" | "embedding" = "chat",
  ) {
    const config = id
      ? await this.prisma.aiProviderConfig.findFirst({
          where: { id, userId, enabled: true },
        })
      : await this.prisma.aiProviderConfig.findFirst({
          where: {
            userId,
            enabled: true,
            ...(purpose === "chat"
              ? { isDefaultChat: true }
              : { isDefaultEmbedding: true }),
          },
          orderBy: { createdAt: "asc" },
        });
    if (id && !config) throw new NotFoundException("模型配置不存在或已停用");
    if (config && purpose === "embedding" && !config.embeddingModel)
      throw new BadRequestException("默认模型没有配置嵌入模型");
    return config;
  }

  gatewayConfig(config: AiProviderConfig, apiKey?: string): GatewayConfig {
    const capabilities =
      config.capabilities &&
      typeof config.capabilities === "object" &&
      !Array.isArray(config.capabilities)
        ? (config.capabilities as Record<string, unknown>)
        : {};
    return {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: apiKey || undefined,
      chatModel: config.chatModel,
      embeddingModel: config.embeddingModel,
      apiMode:
        capabilities.apiMode === "RESPONSES" ? "RESPONSES" : "CHAT_COMPLETIONS",
    };
  }

  private async findOwned(userId: string, id: string) {
    const config = await this.prisma.aiProviderConfig.findFirst({
      where: { id, userId },
    });
    if (!config) throw new NotFoundException("模型配置不存在");
    return config;
  }

  async validateCredentials(
    userId: string,
    credentials: TemporaryCredentialInput[],
  ) {
    if (!credentials.length) return;
    const ids = [...new Set(credentials.map((item) => item.configId))];
    if (ids.length !== credentials.length)
      throw new BadRequestException("临时凭据不能包含重复配置");
    const count = await this.prisma.aiProviderConfig.count({
      where: { id: { in: ids }, userId, enabled: true },
    });
    if (count !== ids.length)
      throw new ForbiddenException("临时凭据包含无权访问的模型配置");
  }

  private publicConfig(config: AiProviderConfig) {
    return config;
  }

  private normalizeUrl(value: string) {
    return value.replace(/\/+$/, "");
  }

  private async validateEndpoint(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("模型地址格式无效");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new BadRequestException("模型地址只允许不含凭据的 HTTP/HTTPS URL");
    if (
      process.env.ALLOW_PRIVATE_AI_ENDPOINTS === "true" ||
      process.env.NODE_ENV !== "production"
    )
      return;
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true }).catch(() => {
          throw new BadRequestException("无法解析模型地址");
        });
    if (addresses.some(({ address }) => isPrivateAddress(address)))
      throw new BadRequestException("云部署禁止访问本机或内网模型地址");
  }
}
