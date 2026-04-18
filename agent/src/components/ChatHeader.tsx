import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ModelState {
  active: number;
  models: string[];
}

interface ChatHeaderProps {
  modelState: ModelState;
  onSelectModel: (index: number) => void;
  hasMessages: boolean;
  onNewChat: () => void;
  disabled: boolean;
}

function ModelDropdown({
  modelState,
  onSelectModel,
  disabled,
}: Pick<ChatHeaderProps, "modelState" | "onSelectModel" | "disabled">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)] disabled:opacity-40"
      >
        {modelState.models[modelState.active]}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Modell wechseln"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {modelState.models.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onSelectModel(i);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-alt)]",
                i === modelState.active
                  ? "font-medium text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)]",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i === modelState.active ? "bg-[var(--color-accent)]" : "bg-transparent",
                )}
              />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelSelector(props: Pick<ChatHeaderProps, "modelState" | "onSelectModel" | "disabled">) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div className="flex items-center gap-1">
      <ModelDropdown {...props} />
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-muted)] opacity-60 transition-opacity hover:opacity-100"
      >
        Hide
      </button>
    </div>
  );
}

export function ChatHeader({
  modelState,
  onSelectModel,
  hasMessages,
  onNewChat,
  disabled,
}: ChatHeaderProps) {
  return (
    <header className="relative z-20 flex-none border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-user-text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="fugs-ki"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">fugs-ki</h1>
        </div>

        <div className="flex items-center gap-2">
          {modelState.models.length > 1 && (
            <ModelSelector
              modelState={modelState}
              onSelectModel={onSelectModel}
              disabled={disabled}
            />
          )}
          {hasMessages && (
            <button
              type="button"
              onClick={onNewChat}
              disabled={disabled}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Neuer Chat
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
