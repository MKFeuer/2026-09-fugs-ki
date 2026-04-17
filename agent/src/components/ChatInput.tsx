import { type RefObject, useState } from "react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isLoading: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({ onSend, onStop, isLoading, inputRef }: ChatInputProps) {
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    onSend(text);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 pb-4">
      <div className="pointer-events-auto mx-auto max-w-3xl px-3 lg:px-4">
        <form onSubmit={handleSubmit}>
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-accent)]/25 bg-[var(--color-surface)] shadow-md">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Nachricht eingeben..."
              disabled={isLoading}
              rows={1}
              className="w-full resize-none overflow-y-auto bg-transparent px-5 pt-4 pb-1 text-sm outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
            />
            <div className="flex items-center justify-end px-3 pb-3">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    role="img"
                    aria-label="Stop"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                    input.trim()
                      ? "bg-[var(--color-user-bubble)] text-[var(--color-user-text)] shadow-sm"
                      : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]",
                  )}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="img"
                    aria-label="Senden"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
