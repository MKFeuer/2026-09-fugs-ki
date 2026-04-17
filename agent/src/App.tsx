import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function App() {
  const { messages, setMessages, sendMessage, status, error, clearError, stop } = useChat({
    transport,
  });
  const [modelState, setModelState] = useState({ active: 0, models: [] as string[] });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  const messageCount = messages.length;
  const lastMessage = messages[messageCount - 1];
  const lastPartCount = lastMessage?.parts.length ?? 0;

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then(setModelState)
      .catch(() => {});
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional scroll trigger on message changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messageCount, lastPartCount]);

  useEffect(() => {
    if (status !== "streaming") return;
    const el = scrollRef.current;
    if (!el) return;
    const id = setInterval(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status]);

  async function selectModel(index: number) {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    setModelState(await res.json());
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-surface)]">
      <ChatHeader
        modelState={modelState}
        onSelectModel={selectModel}
        hasMessages={messages.length > 0}
        onNewChat={() => {
          setMessages([]);
          clearError();
        }}
        disabled={isLoading}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="flex-1 px-4 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-4 py-28">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)]">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      role="img"
                      aria-label="Chat"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-medium text-[var(--color-text)]">
                      Wie kann ich helfen?
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Schreib eine Nachricht um loszulegen
                    </p>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {status === "submitted" && (
                <div className="msg-enter flex justify-start">
                  <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border-l-2 border-[var(--color-accent)]/30 bg-[var(--color-surface-alt)] px-4 py-3">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                </div>
              )}

              {error && (
                <div className="msg-enter rounded-lg border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-text)]">
                  {error.message || "Ein Fehler ist aufgetreten."}
                </div>
              )}
            </div>
          </div>

          <ChatInput
            onSend={(text) => sendMessage({ text })}
            onStop={stop}
            isLoading={isLoading}
            inputRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}
