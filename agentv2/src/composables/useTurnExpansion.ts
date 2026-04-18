import { computed, ref } from "vue";

export function useTurnExpansion() {
  const expandedTurnIds = ref<Record<string, string[]>>({});

  function isExpanded(chatId: string, turnId: string) {
    return expandedTurnIds.value[chatId]?.includes(turnId) ?? false;
  }

  function setExpanded(chatId: string, turnId: string, expanded: boolean) {
    const current = new Set(expandedTurnIds.value[chatId] ?? []);
    if (expanded) current.add(turnId);
    else current.delete(turnId);
    expandedTurnIds.value = {
      ...expandedTurnIds.value,
      [chatId]: [...current],
    };
  }

  function expandTurn(chatId: string, turnId: string) {
    setExpanded(chatId, turnId, true);
  }

  function collapseTurn(chatId: string, turnId: string) {
    setExpanded(chatId, turnId, false);
  }

  function collapseChatTurns(chatId: string, keepTurnId?: string) {
    const current = expandedTurnIds.value[chatId] ?? [];
    expandedTurnIds.value = {
      ...expandedTurnIds.value,
      [chatId]: keepTurnId ? current.filter((turnId) => turnId === keepTurnId) : [],
    };
  }

  const expandedTurnCount = computed(() =>
    Object.values(expandedTurnIds.value).reduce((count, entries) => count + entries.length, 0),
  );

  return {
    expandedTurnIds,
    expandedTurnCount,
    isExpanded,
    setExpanded,
    expandTurn,
    collapseTurn,
    collapseChatTurns,
  };
}
