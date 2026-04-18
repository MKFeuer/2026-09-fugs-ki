import { ref, computed } from "vue";
import type { SessionState, ConnectionStatus } from "../../shared/types";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(url: string = "ws://localhost:3001/ws") {
  const socket = ref<WebSocket | null>(null);
  const connectionStatus = ref<ConnectionStatus>("idle");
  const statusDetail = ref("Nicht verbunden");
  const isConnected = computed(() => connectionStatus.value === "ready");

  const connect = () => {
    if (socket.value) return;

    connectionStatus.value = "connecting";
    statusDetail.value = "Verbindung wird hergestellt...";

    socket.value = new WebSocket(url);

    socket.value.onopen = () => {
      connectionStatus.value = "ready";
      statusDetail.value = "Verbunden";
    };

    socket.value.onclose = () => {
      connectionStatus.value = "idle";
      statusDetail.value = "Verbindung unterbrochen";
      socket.value = null;
    };

    socket.value.onerror = (error) => {
      connectionStatus.value = "error";
      statusDetail.value = "Verbindungsfehler";
      console.error("WebSocket error:", error);
    };
  };

  const disconnect = () => {
    if (socket.value) {
      socket.value.close();
      socket.value = null;
    }
  };

  const send = (message: WebSocketMessage) => {
    if (socket.value && isConnected.value) {
      socket.value.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected");
    }
  };

  const on = (handler: (message: WebSocketMessage) => void) => {
    if (socket.value) {
      socket.value.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        handler(message);
      });
    }
  };

  return {
    socket,
    connectionStatus,
    statusDetail,
    isConnected,
    connect,
    disconnect,
    send,
    on,
  };
}
