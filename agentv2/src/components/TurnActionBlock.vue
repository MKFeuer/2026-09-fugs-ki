<script setup lang="ts">
import { computed } from "vue";
import type { ChatTurn } from "../../shared/turn";

const props = defineProps<{
  turn: ChatTurn;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const summaryText = computed(() => {
  const summary = props.turn.actionSummary;
  const parts = [
    `${summary.stepCount} Schritte`,
    summary.toolCount ? `${summary.toolCount} Tools` : null,
    summary.canvasCount ? `${summary.canvasCount} Canvas` : null,
    summary.errorCount ? `${summary.errorCount} Fehler` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Keine Aktionen";
});
</script>

<template>
  <section class="turn-actions" :data-status="turn.status">
    <button class="turn-actions-summary" type="button" :aria-expanded="expanded" @click="emit('toggle')">
      <span class="turn-actions-chevron">{{ expanded ? "▾" : "▸" }}</span>
      <span class="turn-actions-headline">{{ turn.actionSummary.headline }}</span>
      <span class="turn-actions-meta">{{ summaryText }}</span>
    </button>

    <div v-if="expanded" class="turn-actions-list">
      <div v-for="item in turn.actionItems" :key="item.id" class="turn-actions-row" :data-tone="item.tone">
        <span class="turn-actions-row-label">{{ item.label }}</span>
        <span class="turn-actions-row-detail">{{ item.detail }}</span>
      </div>
    </div>
  </section>
</template>
