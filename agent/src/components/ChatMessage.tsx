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

function partChars(part: UIMessage["parts"][number]): number {
  if (part.type === "text") return part.text.length;
  if (isToolUIPart(part)) {
    let chars = 0;
    if ("input" in part && part.input) chars += JSON.stringify(part.input).length;
    if ("output" in part && part.output) chars += JSON.stringify(part.output).length;
    return chars;
  }
  return 0;
}

function totalChars(message: UIMessage): number {
  return message.parts.reduce((sum, part) => sum + partChars(part), 0);
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const chars = totalChars(message);

  return (
    <div className={cn("msg-enter flex items-end gap-1", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="group relative mb-1 cursor-default text-[var(--color-text-muted)] opacity-40 hover:opacity-80" title={`${chars.toLocaleString()} chars`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] text-base leading-relaxed",
          isUser
            ? "rounded-2xl rounded-br-md bg-[var(--color-user-bubble)] px-4 py-2.5 text-[var(--color-user-text)]"
            : "rounded-2xl rounded-bl-md border-l-2 border-[var(--color-accent)]/30 bg-[var(--color-surface-alt)] py-2.5 pl-4 pr-4",
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
              <div key={key} className="prose-chat max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              </div>
            );
          }

          if (isToolUIPart(part)) {
            const isDone = part.state === "output-available";
            const toolName =
              part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");
            const toolChars = partChars(part);
            return (
              <div
                key={key}
                title={`${toolChars.toLocaleString()} chars`}
                className="my-1.5 inline-flex items-center gap-2 rounded-lg bg-[var(--color-tool-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-tool-text)]"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full bg-[var(--color-tool-text)]",
                    !isDone && "animate-pulse",
                  )}
                />
                <span>{toolName}</span>
                {isDone ? (
                  <span className="opacity-50">done</span>
                ) : (
                  <span className="opacity-50">running</span>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
      {isUser && (
        <span className="group relative mb-1 cursor-default text-[var(--color-text-muted)] opacity-40 hover:opacity-80" title={`${chars.toLocaleString()} chars`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>
      )}
    </div>
  );
}
