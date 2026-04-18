<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  CanvasDiagramItem,
  CanvasItem,
  CanvasMapItem,
} from "../../shared/canvas";
import { useMapInteraction } from "../composables/useMapInteraction";

const props = defineProps<{
  item: CanvasItem;
  compact?: boolean;
}>();

const frameRef = ref<HTMLElement | null>(null);
const mapFrameRef = ref<HTMLElement | null>(null);
const frameSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | undefined;

// Map interaction state
const mapInteraction = computed(() => {
  if (props.item.kind !== "map") return null;
  return useMapInteraction(props.item as CanvasMapItem);
});

// Mouse interaction state
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const TILE_SIZE = 256;

function project(lat: number, lng: number, zoom: number) {
  const scale = 2 ** zoom * TILE_SIZE;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldToScreen(point: { lat: number; lng: number }, map: CanvasMapItem) {
  const size = frameSize.value;
  const center = project(map.center.lat, map.center.lng, map.zoom);
  const width = size.width || 720;
  const height = size.height || 440;
  const topLeftX = center.x - width / 2;
  const topLeftY = center.y - height / 2;
  const projected = project(point.lat, point.lng, map.zoom);
  return {
    x: projected.x - topLeftX,
    y: projected.y - topLeftY,
  };
}

function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

const diagramLayout = computed(() => {
  if (props.item.kind !== "diagram") return null;

  const item = props.item as CanvasDiagramItem;
  const cx = 400;
  const cy = 210;
  const nodeCount = Math.max(item.nodes.length, 1);
  const positions = new Map<string, { x: number; y: number }>();

  if (item.layout === "timeline") {
    const gap = nodeCount > 1 ? 640 / (nodeCount - 1) : 0;
    item.nodes.forEach((node, index) => {
      positions.set(node.id, { x: 80 + gap * index, y: cy });
    });
  } else if (item.layout === "matrix") {
    const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(nodeCount))));
    const rows = Math.ceil(nodeCount / columns);
    const xGap = columns > 1 ? 640 / (columns - 1) : 0;
    const yGap = rows > 1 ? 220 / (rows - 1) : 0;
    item.nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(node.id, { x: 120 + xGap * column, y: 120 + yGap * row });
    });
  } else if (item.layout === "radial") {
    const radius = nodeCount > 1 ? 130 : 0;
    item.nodes.forEach((node, index) => {
      if (nodeCount === 1) {
        positions.set(node.id, { x: cx, y: cy });
        return;
      }
      const angle = (index / nodeCount) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
  } else {
    const xGap = nodeCount > 1 ? 640 / (nodeCount - 1) : 0;
    item.nodes.forEach((node, index) => {
      positions.set(node.id, { x: 80 + xGap * index, y: cy });
    });
  }

  return {
    nodes: item.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: cx, y: cy }) })),
    edges: item.edges,
    layout: item.layout,
  };
});

const mapLayout = computed(() => {
  if (props.item.kind !== "map" || !mapInteraction.value) return null;
  const item = props.item as CanvasMapItem;
  const vm = mapInteraction.value.viewModel.value;
  const width = frameSize.value.width || 720;
  const height = frameSize.value.height || 440;
  const centerPixel = project(vm.center.lat, vm.center.lng, vm.zoom);
  const topLeftX = centerPixel.x - width / 2;
  const topLeftY = centerPixel.y - height / 2;
  const startTileX = Math.floor(topLeftX / TILE_SIZE) - 1;
  const startTileY = Math.floor(topLeftY / TILE_SIZE) - 1;
  const cols = Math.ceil(width / TILE_SIZE) + 3;
  const rows = Math.ceil(height / TILE_SIZE) + 3;

  const tiles = Array.from({ length: cols * rows }, (_, index) => {
    const x = startTileX + (index % cols);
    const y = startTileY + Math.floor(index / cols);
    return {
      x,
      y,
      left: x * TILE_SIZE - topLeftX,
      top: y * TILE_SIZE - topLeftY,
      url: `https://tile.openstreetmap.org/${vm.zoom}/${x}/${y}.png`,
    };
  });

  const markers = item.markers.map((marker) => ({
    ...marker,
    screen: worldToScreen(marker.point, { ...item, zoom: vm.zoom, center: vm.center }),
  }));

  const areas = item.areas.map((area) => {
    const screen = worldToScreen(area.center, { ...item, zoom: vm.zoom, center: vm.center });
    const pixels = area.radiusMeters / metersPerPixel(area.center.lat, vm.zoom);
    return { ...area, screen, pixels };
  });

  const routes = item.routes.map((route) => ({
    ...route,
    points: route.points.map((point) => worldToScreen(point, { ...item, zoom: vm.zoom, center: vm.center })),
  }));

  return {
    width,
    height,
    tiles,
    markers,
    areas,
    routes,
    zoom: vm.zoom,
    visibleLayers: vm.visibleLayers,
  };
});

const compactTitle = computed(() => {
  if (props.item.kind === "diagram") {
    return `${props.item.layout.toUpperCase()} · ${props.item.nodes.length} Knoten`;
  }
  if (props.item.kind === "map") {
    return `${props.item.markers.length} Marker · ${props.item.routes.length} Routen`;
  }
  if (props.item.kind === "image") {
    return props.item.caption ?? props.item.altText;
  }
  return props.item.text.slice(0, 90);
});

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    frameSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    };
  });

  // For compact maps, use frameRef; for full-screen maps, observe mapFrameRef
  const observeTarget = frameRef.value || mapFrameRef.value;
  if (observeTarget) {
    resizeObserver.observe(observeTarget);
  }

  // Add map interaction handlers
  const mapFrame = mapFrameRef.value;
  if (mapFrame && mapInteraction.value) {
    mapFrame.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        mapInteraction.value!.zoomIn();
      } else {
        mapInteraction.value!.zoomOut();
      }
    });

    mapFrame.addEventListener("mousedown", (e) => {
      isDragging.value = true;
      dragStart.value = { x: e.clientX, y: e.clientY };
    });

    mapFrame.addEventListener("mousemove", (e) => {
      if (isDragging.value) {
        const deltaX = e.clientX - dragStart.value.x;
        const deltaY = e.clientY - dragStart.value.y;
        mapInteraction.value!.pan(deltaY, deltaX);
        dragStart.value = { x: e.clientX, y: e.clientY };
      }
    });

    mapFrame.addEventListener("mouseup", () => {
      isDragging.value = false;
    });

    mapFrame.addEventListener("mouseleave", () => {
      isDragging.value = false;
    });

    mapFrame.addEventListener("dblclick", (e) => {
      e.preventDefault();
      mapInteraction.value!.fitToContent();
    });
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <article v-if="compact" class="artifact artifact-compact" :data-kind="item.kind">
    <div v-if="item.kind === 'diagram'" class="compact-slide compact-slide-diagram">
      <svg v-if="diagramLayout" class="diagram-svg compact-diagram-svg" viewBox="0 0 800 420" role="img" :aria-label="item.title">
        <defs>
          <marker id="diagram-arrow-compact" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
        </defs>

        <g v-if="diagramLayout.layout === 'timeline'">
          <line x1="70" y1="210" x2="730" y2="210" class="diagram-timeline" />
        </g>

        <g v-for="edge in diagramLayout.edges" :key="`${edge.from}-${edge.to}-${edge.label ?? ''}`">
          <line
            :x1="diagramLayout.nodes.find((node) => node.id === edge.from)?.x ?? 400"
            :y1="diagramLayout.nodes.find((node) => node.id === edge.from)?.y ?? 210"
            :x2="diagramLayout.nodes.find((node) => node.id === edge.to)?.x ?? 400"
            :y2="diagramLayout.nodes.find((node) => node.id === edge.to)?.y ?? 210"
            class="diagram-edge"
            marker-end="url(#diagram-arrow-compact)"
          />
        </g>

        <g v-for="node in diagramLayout.nodes" :key="node.id">
          <circle :cx="node.x" :cy="node.y" r="32" class="diagram-node-ring compact-node-ring" />
          <circle :cx="node.x" :cy="node.y" r="23" class="diagram-node-core compact-node-core" />
          <text :x="node.x" :y="node.y + 4" text-anchor="middle" class="diagram-node-label compact-node-label">
            {{ node.label }}
          </text>
        </g>
      </svg>
    </div>

    <div v-else-if="item.kind === 'map'" ref="frameRef" class="compact-slide compact-slide-map">
      <div ref="mapFrameRef" class="map-frame compact-map-frame" :class="{ 'is-dragging': isDragging }">
        <div class="map-tiles">
          <img
            v-for="tile in mapLayout?.tiles ?? []"
            :key="`${tile.x}-${tile.y}`"
            :src="tile.url"
            alt=""
            class="map-tile compact-map-tile"
            :style="{ left: `${tile.left}px`, top: `${tile.top}px` }"
          />
        </div>

        <svg
          v-if="mapLayout"
          class="map-overlay"
          :viewBox="`0 0 ${mapLayout.width} ${mapLayout.height}`"
          preserveAspectRatio="none"
        >
          <g v-for="area in mapLayout.areas" :key="area.id">
            <circle
              :cx="area.screen.x"
              :cy="area.screen.y"
              :r="area.pixels"
              :style="{ stroke: area.color ?? '#d18b22', fill: `${area.color ?? '#d18b22'}22` }"
              class="map-area"
            />
          </g>

          <g v-for="route in mapLayout.routes" :key="route.id">
            <polyline
              v-if="route.points.length > 1"
              :points="route.points.map((point) => `${point.x},${point.y}`).join(' ')"
              class="map-route-line"
              :style="{ stroke: route.color ?? '#c65d15' }"
            />
          </g>

          <g v-for="marker in mapLayout.markers" :key="marker.id">
            <circle
              :cx="marker.screen.x"
              :cy="marker.screen.y"
              r="8"
              class="map-marker-dot"
              :data-kind="marker.kind"
            />
          </g>
        </svg>

        <div v-if="mapInteraction && item.kind === 'map'" class="map-controls">
          <button class="map-button map-button-zoom-in" type="button" @click="mapInteraction.zoomIn()" title="Zoom in (Mausrad)">
            <span>+</span>
          </button>
          <button class="map-button map-button-zoom-out" type="button" @click="mapInteraction.zoomOut()" title="Zoom out (Mausrad)">
            <span>−</span>
          </button>
          <button class="map-button map-button-fit" type="button" @click="mapInteraction.fitToContent()" title="Fit to content (Doppel-Klick)">
            <span>⛶</span>
          </button>
        </div>

        <div v-if="mapInteraction && item.kind === 'map' && (item as CanvasMapItem).layers.length > 0" class="map-layers">
          <button
            v-for="layer in (item as CanvasMapItem).layers"
            :key="layer"
            class="map-layer-button"
            :data-active="mapInteraction.isLayerVisible.value(layer)"
            @click="mapInteraction.toggleLayer(layer)"
            type="button"
          >
            {{ layer }}
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="item.kind === 'image'" class="compact-slide compact-slide-image">
      <img v-if="item.sourceUrl" :src="item.sourceUrl" :alt="item.altText" />
      <div v-else class="compact-placeholder compact-image-placeholder" />
    </div>

    <div v-else class="compact-slide compact-slide-note">
      <div class="compact-note-mark" />
    </div>
  </article>

  <article v-else-if="item.kind === 'diagram'" class="artifact artifact-diagram">
    <div class="artifact-meta">
      <span class="artifact-kind">Diagramm</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>

    <svg v-if="diagramLayout" class="diagram-svg" viewBox="0 0 800 420" role="img" :aria-label="item.title">
      <defs>
        <marker id="diagram-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
        </marker>
      </defs>

      <g v-if="diagramLayout.layout === 'timeline'">
        <line x1="70" y1="210" x2="730" y2="210" class="diagram-timeline" />
      </g>

      <g v-for="edge in diagramLayout.edges" :key="`${edge.from}-${edge.to}-${edge.label ?? ''}`">
        <line
          :x1="diagramLayout.nodes.find((node) => node.id === edge.from)?.x ?? 400"
          :y1="diagramLayout.nodes.find((node) => node.id === edge.from)?.y ?? 210"
          :x2="diagramLayout.nodes.find((node) => node.id === edge.to)?.x ?? 400"
          :y2="diagramLayout.nodes.find((node) => node.id === edge.to)?.y ?? 210"
          class="diagram-edge"
          marker-end="url(#diagram-arrow)"
        />
      </g>

      <g v-for="node in diagramLayout.nodes" :key="node.id">
        <circle :cx="node.x" :cy="node.y" r="38" class="diagram-node-ring" />
        <circle :cx="node.x" :cy="node.y" r="28" class="diagram-node-core" />
        <text :x="node.x" :y="node.y - 4" text-anchor="middle" class="diagram-node-label">
          {{ node.label }}
        </text>
        <text v-if="node.detail" :x="node.x" :y="node.y + 16" text-anchor="middle" class="diagram-node-detail">
          {{ node.detail }}
        </text>
      </g>

      <text
        v-if="item.edges.length === 0"
        x="400"
        y="392"
        text-anchor="middle"
        class="diagram-empty"
      >
        Kein Verbindungsnetz angegeben – Diagramm bleibt als Platzhalter sichtbar.
      </text>
    </svg>
  </article>

  <article v-else-if="item.kind === 'image'" class="artifact artifact-image">
    <div class="artifact-meta">
      <span class="artifact-kind">Bild</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>

    <div v-if="item.sourceUrl" class="image-frame">
      <img :src="item.sourceUrl" :alt="item.altText" />
    </div>
    <div v-else class="image-placeholder">
      <strong>{{ item.altText }}</strong>
      <span>Keine Bildgenerierung – nur vorhandenes Material oder Platzhalter.</span>
    </div>

    <p v-if="item.caption" class="artifact-caption">{{ item.caption }}</p>
  </article>

  <article v-else-if="item.kind === 'map'" class="artifact artifact-map">
    <div class="artifact-meta">
      <span class="artifact-kind">OSM-Karte</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>

    <div ref="mapFrameRef" class="map-frame" :class="{ 'is-dragging': isDragging }">
      <div class="map-tiles">
        <img
          v-for="tile in mapLayout?.tiles ?? []"
          :key="`${tile.x}-${tile.y}`"
          :src="tile.url"
          alt=""
          class="map-tile"
          :style="{ left: `${tile.left}px`, top: `${tile.top}px` }"
        />
      </div>

      <svg
        v-if="mapLayout"
        class="map-overlay"
        :viewBox="`0 0 ${mapLayout.width} ${mapLayout.height}`"
        preserveAspectRatio="none"
      >
        <g v-for="area in mapLayout.areas" :key="area.id">
          <circle
            :cx="area.screen.x"
            :cy="area.screen.y"
            :r="area.pixels"
            :style="{ stroke: area.color ?? '#d18b22', fill: `${area.color ?? '#d18b22'}22` }"
            class="map-area"
          />
          <text :x="area.screen.x" :y="area.screen.y - area.pixels - 6" text-anchor="middle" class="map-label">
            {{ area.label }}
          </text>
        </g>

        <g v-for="route in mapLayout.routes" :key="route.id">
          <polyline
            v-if="route.points.length > 1"
            :points="route.points.map((point) => `${point.x},${point.y}`).join(' ')"
            class="map-route-line"
            :style="{ stroke: route.color ?? '#c65d15' }"
          />
        </g>

        <g v-for="marker in mapLayout.markers" :key="marker.id">
          <circle
            :cx="marker.screen.x"
            :cy="marker.screen.y"
            r="8"
            class="map-marker-dot"
            :data-kind="marker.kind"
          />
          <text
            :x="marker.screen.x"
            :y="marker.screen.y - 12"
            text-anchor="middle"
            class="map-label"
          >
            {{ marker.label }}
          </text>
        </g>
      </svg>

      <div class="map-center-card">
        <strong>{{ item.centerLabel }}</strong>
        <span>{{ mapInteraction?.viewModel.value.center.lat.toFixed(4) }}, {{ mapInteraction?.viewModel.value.center.lng.toFixed(4) }}</span>
      </div>

      <div class="map-legend">
        <span v-for="entry in item.legend" :key="entry" class="map-legend-tag">{{ entry }}</span>
      </div>

      <div v-if="mapInteraction && item.kind === 'map'" class="map-controls">
        <button class="map-button map-button-zoom-in" type="button" @click="mapInteraction.zoomIn()" title="Zoom in (Mausrad)">
          <span>+</span>
        </button>
        <button class="map-button map-button-zoom-out" type="button" @click="mapInteraction.zoomOut()" title="Zoom out (Mausrad)">
          <span>−</span>
        </button>
        <button class="map-button map-button-fit" type="button" @click="mapInteraction.fitToContent()" title="Fit to content (Doppel-Klick)">
          <span>⛶</span>
        </button>
      </div>

      <div v-if="mapInteraction && item.kind === 'map' && item.layers.length > 0" class="map-layers">
        <button
          v-for="layer in item.layers"
          :key="layer"
          class="map-layer-button"
          :data-active="mapInteraction.isLayerVisible.value(layer)"
          @click="mapInteraction.toggleLayer(layer)"
          type="button"
        >
          {{ layer }}
        </button>
      </div>
    </div>

    <div class="map-subgrid">
      <span v-for="layer in item.layers" :key="layer" class="map-layer-tag">{{ layer }}</span>
      <div v-for="route in item.routes" :key="route.id" class="map-route-card">
        <strong>{{ route.name }}</strong>
        <p>{{ route.description }}</p>
      </div>
    </div>
  </article>

  <article v-else class="artifact artifact-note">
    <div class="artifact-meta">
      <span class="artifact-kind">Notiz</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>
    <p class="note-text">{{ item.text }}</p>
  </article>
</template>
