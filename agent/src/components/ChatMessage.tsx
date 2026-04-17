import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: UIMessage;
}

function partKey(messageId: string, part: UIMessage["parts"][number], index: number): string {
  if ("toolCallId" in part) return part.toolCallId;
  return `${messageId}-${part.type}-${index}`;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] text-sm leading-relaxed",
          isUser
            ? "rounded-2xl bg-[var(--color-user-bubble)] px-4 py-2.5 text-[var(--color-user-text)]"
            : "rounded-2xl border-l-2 border-[var(--color-accent)]/40 bg-[var(--color-surface-alt)] py-2.5 pl-4 pr-4",
        )}
      >
        {message.parts.map((part, i) => {
          const key = partKey(message.id, part, i);

          if (part.type === "text") {
            if (isUser) {
              return (
                <div key={key} className="whitespace-pre-wrap break-words">
                  {part.text}
                </div>
              );
            }
            return (
              <div key={key} className="prose prose-sm max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              </div>
            );
          }

          if (isToolUIPart(part)) {
            const isDone = part.state === "output-available";
            const toolName =
              part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");
            return (
              <div
                key={key}
                className="my-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-tool)] px-2.5 py-1 text-xs font-medium text-[var(--color-tool-text)]"
              >
                <span className="opacity-60">tool:</span>
                <span>{toolName}</span>
                {isDone ? (
                  <span className="opacity-60">done</span>
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
