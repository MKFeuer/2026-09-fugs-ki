<script setup lang="ts">
import MarkdownMessage from "./MarkdownMessage.vue";
import TurnActionBlock from "./TurnActionBlock.vue";
import type { ChatTurn } from "../../shared/turn";

defineProps<{
  turn: ChatTurn;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <article class="chat-turn" :data-status="turn.status">
    <article v-if="turn.userContent" class="message user chat-turn-user">
      <div class="message-bubble">
        <MarkdownMessage :content="turn.userContent" />
      </div>
    </article>

    <TurnActionBlock
      v-if="turn.actionItems.length > 0"
      :turn="turn"
      :expanded="expanded"
      class="chat-turn-actions"
      @toggle="emit('toggle')"
    />

    <article v-if="turn.assistantContent" class="message assistant chat-turn-assistant">
      <div class="message-bubble">
        <div v-if="turn.status === 'live'" class="stream-label">Streaming...</div>
        <MarkdownMessage :content="turn.assistantContent" />
      </div>
    </article>
    <article v-else-if="turn.status === 'live'" class="message assistant chat-turn-assistant">
      <div class="message-bubble">
        <div class="stream-label">Streaming...</div>
        <p class="assistant-placeholder">Antwort wird vorbereitet …</p>
      </div>
    </article>
  </article>
</template>
