export type RuntimeModelProvider = "openai" | "ollama";

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

function toBoolean(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toUrl(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function ensureModelId(requested: string | undefined, models: RuntimeModelConfig[], fallback: string) {
  if (!requested?.trim()) return fallback;
  const found = models.find((model) => model.id === requested.trim());
  return found ? found.id : fallback;
}

function createOpenAIModel(): RuntimeModelConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
  const baseUrl = toUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com/v1");
  return {
    id: `openai-${slugify(model)}`,
    label: `OpenAI / ${model}`,
    provider: "openai",
    baseUrl,
    model,
    apiKey,
    apiKeyEnv: "OPENAI_API_KEY",
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
  };
}

function createOllamaModel(): RuntimeModelConfig | null {
  const enabled = toBoolean(process.env.OLLAMA_ENABLED, false);
  const configured = Boolean(process.env.OLLAMA_MODEL?.trim() || process.env.OLLAMA_BASE_URL?.trim());
  if (!enabled && !configured && process.env.LLM_PROVIDER?.trim() !== "ollama") return null;

  const model = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:14b";
  const baseUrl = toUrl(process.env.OLLAMA_BASE_URL, "http://localhost:11434/v1");
  return {
    id: `ollama-${slugify(model)}`,
    label: `Ollama / ${model}`,
    provider: "ollama",
    baseUrl,
    model,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  const models: RuntimeModelConfig[] = [];
  const legacyProvider = process.env.LLM_PROVIDER?.trim();

  const openaiModel = createOpenAIModel();
  const ollamaModel = createOllamaModel();

  if (legacyProvider === "ollama") {
    if (ollamaModel) models.push(ollamaModel);
    if (openaiModel && process.env.OPENAI_ENABLED?.trim() === "true") models.push(openaiModel);
  } else {
    if (openaiModel) models.push(openaiModel);
    if (ollamaModel) models.push(ollamaModel);
  }

  if (models.length === 0) {
    throw new Error("No LLM models configured. Set OPENAI_API_KEY or enable Ollama in .env.");
  }

  const preferredDefaultId =
    legacyProvider === "ollama" && ollamaModel ? ollamaModel.id : openaiModel?.id ?? ollamaModel?.id ?? models[0].id;
  const defaultModelId = ensureModelId(process.env.DEFAULT_MODEL_ID, models, preferredDefaultId);
  const autoConnectModelId = ensureModelId(process.env.AUTO_CONNECT_MODEL_ID, models, defaultModelId);

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
