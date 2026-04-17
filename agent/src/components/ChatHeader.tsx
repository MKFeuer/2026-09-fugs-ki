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

export function ChatHeader({
  modelState,
  onSelectModel,
  hasMessages,
  onNewChat,
  disabled,
}: ChatHeaderProps) {
  return (
    <header className="flex-none border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]/60 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <h1 className="text-sm font-bold tracking-tight text-[var(--color-text)]">fugs-ki</h1>
        <div className="flex items-center gap-2">
          {modelState.models.length > 1 && (
            <select
              value={modelState.active}
              onChange={(e) => onSelectModel(Number(e.target.value))}
              disabled={disabled}
              className="cursor-pointer appearance-none rounded-full border border-[var(--color-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] outline-none transition-colors hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)] disabled:opacity-40"
            >
              {modelState.models.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {hasMessages && (
            <button
              type="button"
              onClick={onNewChat}
              disabled={disabled}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Neuer Chat
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
