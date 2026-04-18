import { loadRuntimeEnvConfig } from "./env";

export type RuntimeModelProvider = "openai" | "ollama" | "local-llm";

export interface RuntimeModelConfig {
  id: string;
  label: string;
  provider: RuntimeModelProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  apiKeyEnv?: string;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export type PublicRuntimeModelConfig = Omit<RuntimeModelConfig, "apiKey">;

export interface RuntimeConfig {
  models: RuntimeModelConfig[];
  defaultModelId: string;
  autoConnectModelId: string;
}

export interface PublicRuntimeConfig {
  models: PublicRuntimeModelConfig[];
  defaultModelId: string;
  autoConnectModelId: string;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createOpenAIModel(env: ReturnType<typeof loadRuntimeEnvConfig>): RuntimeModelConfig | null {
  if (!env.openaiEnabled) return null;
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_ENABLED is set, but OPENAI_API_KEY is missing.");
  }

  return {
    id: `openai-${slugify(env.openaiModel)}`,
    label: `OpenAI / ${env.openaiModel}`,
    provider: "openai",
    baseUrl: env.openaiBaseUrl,
    model: env.openaiModel,
    apiKey: env.openaiApiKey,
    apiKeyEnv: "OPENAI_API_KEY",
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
  };
}

function createLocalLlmModel(env: ReturnType<typeof loadRuntimeEnvConfig>): RuntimeModelConfig | null {
  if (!env.localLlmEnabled) return null;
  return {
    id: `local-llm-${slugify(env.localLlmModel)}`,
    label: env.localLlmLabel ?? `Local LLM / ${env.localLlmModel}`,
    provider: "local-llm",
    baseUrl: env.localLlmBaseUrl,
    model: env.localLlmModel,
    ...(env.localLlmApiKey ? { apiKey: env.localLlmApiKey } : {}),
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
  };
}

function createOllamaModel(env: ReturnType<typeof loadRuntimeEnvConfig>): RuntimeModelConfig | null {
  if (!env.ollamaEnabled) return null;
  return {
    id: `ollama-${slugify(env.ollamaModel)}`,
    label: `Ollama / ${env.ollamaModel}`,
    provider: "ollama",
    baseUrl: env.ollamaBaseUrl,
    model: env.ollamaModel,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
  };
}

function resolveModelId(requested: string | null, models: RuntimeModelConfig[], label: string, fallback?: string) {
  if (!requested) {
    if (fallback) return fallback;
    throw new Error(`${label} must be set in .env when multiple models are configured.`);
  }

  const found = models.find((model) => model.id === requested);
  if (!found) {
    throw new Error(`${label} points to an unknown model: ${requested}`);
  }

  return found.id;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const env = loadRuntimeEnvConfig();
  const models: RuntimeModelConfig[] = [];

  const openaiModel = createOpenAIModel(env);
  const ollamaModel = createOllamaModel(env);
  const localLlmModel = createLocalLlmModel(env);

  if (env.legacyProvider === "ollama") {
    if (ollamaModel) models.push(ollamaModel);
    if (openaiModel) models.push(openaiModel);
  } else {
    if (openaiModel) models.push(openaiModel);
    if (ollamaModel) models.push(ollamaModel);
  }
  if (localLlmModel) models.push(localLlmModel);

  if (models.length === 0) {
    throw new Error("No LLM models configured. Set OPENAI_API_KEY, enable Ollama, or set LOCAL_LLM_BASE_URL in .env.");
  }

  const preferredSingleModelId = models.length === 1 ? models[0].id : undefined;
  const defaultModelId = resolveModelId(env.defaultModelId, models, "DEFAULT_MODEL_ID", preferredSingleModelId);
  const autoConnectModelId = resolveModelId(env.autoConnectModelId, models, "AUTO_CONNECT_MODEL_ID", preferredSingleModelId);

  return {
    models,
    defaultModelId,
    autoConnectModelId,
  };
}

export function toPublicRuntimeConfig(runtimeConfig: RuntimeConfig): PublicRuntimeConfig {
  return {
    models: runtimeConfig.models.map(({ apiKey: _apiKey, ...model }) => model),
    defaultModelId: runtimeConfig.defaultModelId,
    autoConnectModelId: runtimeConfig.autoConnectModelId,
  };
}

export function getRuntimeModel(runtimeConfig: RuntimeConfig, modelId: string | undefined) {
  const requested = modelId?.trim();
  if (requested) {
    const model = runtimeConfig.models.find((entry) => entry.id === requested);
    if (model) return model;
  }

  return runtimeConfig.models.find((entry) => entry.id === runtimeConfig.autoConnectModelId)
    ?? runtimeConfig.models.find((entry) => entry.id === runtimeConfig.defaultModelId)
    ?? runtimeConfig.models[0];
}
