import "@fontsource-variable/google-sans-flex/wght.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);

// Auto-focus directive for inputs rendered via v-if
app.directive("focus", {
  mounted(el: HTMLElement) { el.focus(); },
});

app.mount("#app");
