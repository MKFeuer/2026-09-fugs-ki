export interface RuntimeEnvConfig {
  legacyProvider: "openai" | "ollama" | null;
  legacyModel: string | null;
  openaiEnabled: boolean;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  openaiModel: string;
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmModel: string;
  localLlmLabel: string | null;
  localLlmApiKey: string | null;
  defaultModelId: string | null;
  autoConnectModelId: string | null;
}

function readText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readBoolean(value: string | undefined, fallback = false) {
  const normalized = readText(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveLegacyProvider(value: string | undefined): RuntimeEnvConfig["legacyProvider"] {
  const normalized = readText(value)?.toLowerCase();
  if (normalized === "openai" || normalized === "ollama") return normalized;
  return null;
}

export function loadRuntimeEnvConfig(): RuntimeEnvConfig {
  const legacyProvider = resolveLegacyProvider(process.env.LLM_PROVIDER);
  const legacyModel = readText(process.env.LLM_MODEL);

  const openaiApiKey = readText(process.env.OPENAI_API_KEY);
  const openaiEnabled = readBoolean(process.env.OPENAI_ENABLED, Boolean(openaiApiKey) || legacyProvider === "openai");
  const openaiBaseUrl = readText(process.env.OPENAI_BASE_URL) ?? "https://api.openai.com/v1";
  const openaiModel = readText(process.env.OPENAI_MODEL) ?? legacyModel ?? "gpt-4o-mini";

  const ollamaEnabled = readBoolean(
    process.env.OLLAMA_ENABLED,
    legacyProvider === "ollama" || Boolean(readText(process.env.OLLAMA_MODEL)) || Boolean(readText(process.env.OLLAMA_BASE_URL)),
  );
  const ollamaBaseUrl = readText(process.env.OLLAMA_BASE_URL) ?? "http://localhost:11434/v1";
  const ollamaModel = readText(process.env.OLLAMA_MODEL) ?? legacyModel ?? "qwen2.5:14b";

  const localLlmBaseUrl = readText(process.env.LOCAL_LLM_BASE_URL);
  const localLlmModel = readText(process.env.LOCAL_LLM_MODEL);
  const localLlmEnabled = readBoolean(
    process.env.LOCAL_LLM_ENABLED,
    Boolean(localLlmBaseUrl) || Boolean(localLlmModel),
  );

  return {
    legacyProvider,
    legacyModel,
    openaiEnabled,
    openaiApiKey,
    openaiBaseUrl,
    openaiModel,
    ollamaEnabled,
    ollamaBaseUrl,
    ollamaModel,
    localLlmEnabled,
    localLlmBaseUrl: localLlmBaseUrl ?? "http://localhost:8080/v1",
    localLlmModel: localLlmModel ?? "local-model",
    localLlmLabel: readText(process.env.LOCAL_LLM_LABEL),
    localLlmApiKey: readText(process.env.LOCAL_LLM_API_KEY),
    defaultModelId: readText(process.env.DEFAULT_MODEL_ID),
    autoConnectModelId: readText(process.env.AUTO_CONNECT_MODEL_ID),
  };
}
