export type OpenAIRole = "system" | "user" | "assistant" | "tool";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type OpenAIConversationMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface StreamOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  messages: OpenAIConversationMessage[];
  signal: AbortSignal;
  tools?: OpenAIToolDefinition[];
  onContentDelta?: (delta: string) => void;
}

export interface StreamResult {
  content: string;
  toolCalls: OpenAIToolCall[];
  finishReason: string | null;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export async function streamOpenAIChat({
  apiKey,
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  model,
  messages,
  signal,
  tools,
  onContentDelta,
}: StreamOptions): Promise<StreamResult> {
  const endpoint = new URL("chat/completions", `${baseUrl.replace(/\/+$/, "")}/`);
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: tools?.length ? "auto" : undefined,
      stream: true,
      temperature: 0.2,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;
  const toolCalls = new Map<number, PendingToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let lineBreak = buffer.indexOf("\n");
    while (lineBreak >= 0) {
      const line = buffer.slice(0, lineBreak).trim();
      buffer = buffer.slice(lineBreak + 1);
      lineBreak = buffer.indexOf("\n");

      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") break;

      const json = JSON.parse(payload) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: "function";
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };

      const choice = json.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        content += choice.delta.content;
        onContentDelta?.(choice.delta.content);
      }

      for (const toolDelta of choice.delta?.tool_calls ?? []) {
        const pending = toolCalls.get(toolDelta.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };

        if (toolDelta.id) pending.id = toolDelta.id;
        if (toolDelta.function?.name) pending.name += toolDelta.function.name;
        if (toolDelta.function?.arguments) pending.arguments += toolDelta.function.arguments;
        toolCalls.set(toolDelta.index, pending);
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    if (done) break;
  }

  return {
    content,
    toolCalls: [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => toolCall)
      .filter((toolCall) => toolCall.id && toolCall.name),
    finishReason,
  };
}
