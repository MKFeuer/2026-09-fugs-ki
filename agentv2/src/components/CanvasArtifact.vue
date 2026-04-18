<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  CanvasChartItem,
  CanvasDiagramItem,
  CanvasItem,
  CanvasMapItem,
  CanvasMapLabel,
  CanvasMapWind,
} from "../../shared/canvas";
import { LMap, LTileLayer, LMarker, LCircle, LCircleMarker, LPolyline, LPolygon, LTooltip } from "@vue-leaflet/vue-leaflet";
import L from "leaflet";

const props = defineProps<{
  item: CanvasItem;
  compact?: boolean;
}>();

// ── Diagram layout ────────────────────────────────────────────────────────────

const diagramLayout = computed(() => {
  if (props.item.kind !== "diagram") return null;
  const item = props.item as CanvasDiagramItem;
  const cx = 400;
  const cy = 210;
  const nodeCount = Math.max(item.nodes.length, 1);
  const positions = new Map<string, { x: number; y: number }>();

  if (item.layout === "timeline") {
    const gap = nodeCount > 1 ? 640 / (nodeCount - 1) : 0;
    item.nodes.forEach((node, i) => positions.set(node.id, { x: 80 + gap * i, y: cy }));
  } else if (item.layout === "matrix") {
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(nodeCount))));
    const rows = Math.ceil(nodeCount / cols);
    const xGap = cols > 1 ? 640 / (cols - 1) : 0;
    const yGap = rows > 1 ? 220 / (rows - 1) : 0;
    item.nodes.forEach((node, i) =>
      positions.set(node.id, { x: 120 + xGap * (i % cols), y: 120 + yGap * Math.floor(i / cols) }),
    );
  } else if (item.layout === "radial") {
    const radius = nodeCount > 1 ? 130 : 0;
    item.nodes.forEach((node, i) => {
      if (nodeCount === 1) { positions.set(node.id, { x: cx, y: cy }); return; }
      const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
  } else {
    const gap = nodeCount > 1 ? 640 / (nodeCount - 1) : 0;
    item.nodes.forEach((node, i) => positions.set(node.id, { x: 80 + gap * i, y: cy }));
  }

  return {
    nodes: item.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: cx, y: cy }) })),
    edges: item.edges,
    layout: item.layout,
  };
});

// ── Chart layout ─────────────────────────────────────────────────────────────

type ChartPointLayout = {
  index: number;
  x: number;
  y: number;
  value: number;
  label: string;
};

type ChartSeriesLayout = {
  label: string;
  color: string;
  values: number[];
  points: ChartPointLayout[];
  linePath: string;
  areaPath: string;
};

type ChartBarLayout = {
  index: number;
  label: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  seriesLabel: string;
};

const CHART_COLORS = ["#c2410c", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0f766e"];
const chartNumberFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const flowRateFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function formatChartValue(value: number) {
  return chartNumberFormatter.format(Number.parseFloat(value.toFixed(2)));
}

function formatFlowRate(flowRateLpm: number) {
  return `${flowRateFormatter.format(flowRateLpm)} L/min`;
}

function chartTypeLabel(chartType: CanvasChartItem["chartType"]) {
  if (chartType === "bar") return "Balken";
  if (chartType === "area") return "Fläche";
  if (chartType === "scatter") return "XY";
  return "Linie";
}

function createChartPointPath(points: ChartPointLayout[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function createTickIndices(length: number, maxTicks = 6) {
  if (length <= maxTicks) return Array.from({ length }, (_, index) => index);

  const ticks = new Set<number>([0, length - 1]);
  for (let step = 1; step < maxTicks - 1; step += 1) {
    ticks.add(Math.round((step / (maxTicks - 1)) * (length - 1)));
  }

  return Array.from(ticks).sort((a, b) => a - b);
}

function createValueTicks(min: number, max: number, count = 5) {
  if (count <= 1) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

const chartLayout = computed(() => {
  if (props.item.kind !== "chart") return null;

  const item = props.item as CanvasChartItem;
  const plot = {
    left: 72,
    top: 30,
    width: 692,
    height: 294,
    right: 764,
    bottom: 324,
  };

  const allValues = item.series.flatMap((series) => series.values);
  if (allValues.length === 0) return null;

  let yMin = Math.min(...allValues);
  let yMax = Math.max(...allValues);
  const includeZeroBaseline = item.chartType === "bar" || item.chartType === "area";

  if (includeZeroBaseline) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }

  if (yMin === yMax) {
    const padding = Math.max(Math.abs(yMin) * 0.2, 1);
    yMin -= padding;
    yMax += padding;
  } else {
    const padding = (yMax - yMin) * 0.12;
    yMin -= padding;
    yMax += padding;
    if (includeZeroBaseline) {
      yMin = Math.min(yMin, 0);
      yMax = Math.max(yMax, 0);
    }
  }

  const numericX = item.chartType === "scatter" && item.xLabels.every((label) => label.trim() && Number.isFinite(Number(label)));
  const xValues = numericX ? item.xLabels.map((label) => Number(label)) : item.xLabels.map((_, index) => index);
  const xMin = numericX ? Math.min(...xValues) : 0;
  const xMax = numericX ? Math.max(...xValues) : Math.max(item.xLabels.length - 1, 1);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const yScale = (value: number) => plot.top + (1 - (value - yMin) / yRange) * plot.height;
  const xScale = (value: number, index: number) => {
    if (item.chartType === "bar") {
      const step = plot.width / item.xLabels.length;
      return plot.left + step * index + step / 2;
    }
    if (numericX) {
      return plot.left + ((value - xMin) / xRange) * plot.width;
    }
    if (item.xLabels.length === 1) {
      return plot.left + plot.width / 2;
    }
    return plot.left + (index / Math.max(item.xLabels.length - 1, 1)) * plot.width;
  };

  const baselineY = Math.min(plot.bottom, Math.max(plot.top, yScale(0)));
  const series = item.series.map((series, seriesIndex): ChartSeriesLayout => {
    const color = series.color ?? CHART_COLORS[seriesIndex % CHART_COLORS.length];
    const points = series.values.map((value, pointIndex) => ({
      index: pointIndex,
      x: xScale(xValues[pointIndex] ?? pointIndex, pointIndex),
      y: yScale(value),
      value,
      label: item.xLabels[pointIndex] ?? String(pointIndex + 1),
    }));

    return {
      label: series.label,
      color,
      values: series.values,
      points,
      linePath: createChartPointPath(points),
      areaPath:
        points.length > 0
          ? [
              `M ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)}`,
              ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
              `L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)}`,
              "Z",
            ].join(" ")
          : "",
    };
  });

  const yTicks = createValueTicks(yMin, yMax).map((value) => ({
    value,
    y: yScale(value),
    label: formatChartValue(value),
  }));
  const xTicks = createTickIndices(item.xLabels.length, numericX ? 5 : 6).map((index) => ({
    index,
    label: item.xLabels[index] ?? "",
    x: xScale(xValues[index] ?? index, index),
  }));

  const bars: ChartBarLayout[] =
    item.chartType === "bar"
      ? (() => {
          const step = plot.width / item.xLabels.length;
          const groupWidth = Math.min(step * 0.76, 108);
          const gap = 4;
          const seriesCount = Math.max(series.length, 1);
          const barWidth = Math.max((groupWidth - gap * (seriesCount - 1)) / seriesCount, 8);

          return item.xLabels.flatMap((label, index) => {
            const center = plot.left + step * index + step / 2;
            const totalWidth = barWidth * seriesCount + gap * (seriesCount - 1);

            return series.map((entry, seriesIndex) => {
              const value = entry.values[index] ?? 0;
              const y = yScale(value);

              return {
                index,
                label,
                value,
                x: center - totalWidth / 2 + seriesIndex * (barWidth + gap),
                y: Math.min(y, baselineY),
                width: barWidth,
                height: Math.max(2, Math.abs(baselineY - y)),
                color: entry.color,
                seriesLabel: entry.label,
              };
            });
          });
        })()
      : [];

  return {
    chartType: item.chartType,
    plot,
    baselineY,
    series,
    bars,
    xTicks,
    yTicks,
    xUnit: item.xUnit,
    yUnit: item.yUnit,
  };
});

// ── Map marker icons ──────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { color: string; label: string; emoji?: string }> = {
  // Classic pin markers
  fire:      { color: "#c53030", label: "F" },
  hydrant:   { color: "#2b6cb0", label: "H" },
  water:     { color: "#0694a2", label: "W" },
  vehicle:   { color: "#c05621", label: "E" },
  point:     { color: "#553c9a", label: "P" },
  // Emoji vehicle markers
  firetruck: { color: "#dc2626", label: "🚒", emoji: "🚒" },
  ladder:    { color: "#b91c1c", label: "🚒", emoji: "🚒" },
  command:   { color: "#7c3aed", label: "⭐", emoji: "⭐" },
  ambulance: { color: "#16a34a", label: "🚑", emoji: "🚑" },
  staging:   { color: "#0891b2", label: "🅿", emoji: "🅿️" },
};

function markerIcon(marker: { kind: string; label: string }) {
  const cfg = KIND_CONFIG[marker.kind] ?? KIND_CONFIG.point;
  const shortName = marker.label.length > 16 ? marker.label.slice(0, 15) + "…" : marker.label;

  if (cfg.emoji) {
    return L.divIcon({
      html: `<div class="map-emoji-group">
        <div class="map-emoji-icon">${cfg.emoji}</div>
        <div class="map-emoji-name">${shortName}</div>
      </div>`,
      className: "",
      iconSize: [80, 48],
      iconAnchor: [40, 30],
      popupAnchor: [0, -36],
    }) as unknown as L.Icon;
  }

  return L.divIcon({
    html: `<div class="map-pin-group">
      <div class="map-pin" style="--pin-color:${cfg.color}"><span>${cfg.label}</span></div>
      <div class="map-pin-name">${shortName}</div>
    </div>`,
    className: "",
    iconSize: [80, 52],
    iconAnchor: [40, 38],
    popupAnchor: [0, -42],
  }) as unknown as L.Icon;
}

function markerColor(kind: string): string {
  return (KIND_CONFIG[kind] ?? KIND_CONFIG.point).color;
}

function labelIcon(label: CanvasMapLabel) {
  const sizeClass = `map-label-pin--${label.size ?? "md"}`;
  const escaped = label.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return L.divIcon({
    html: `<div class="map-label-pin ${sizeClass}">${escaped}</div>`,
    className: "",
    iconSize: [140, 32],
    iconAnchor: [70, 16],
  }) as unknown as L.Icon;
}

function windIcon(wind: CanvasMapWind) {
  const speed = wind.speedKmh ? `${wind.speedKmh}km/h` : "";
  const hint = wind.label ?? speed ?? "Wind";
  return L.divIcon({
    html: `<div class="map-wind-icon" style="--wind-deg:${wind.directionDeg}deg">
      <div class="map-wind-arrow">
        <svg viewBox="0 0 24 36" width="24" height="36" fill="none">
          <line x1="12" y1="32" x2="12" y2="4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M12,4 L6,16 M12,4 L18,16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="map-wind-label">${hint}</div>
    </div>`,
    className: "",
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  }) as unknown as L.Icon;
}

// ── Compact helpers ───────────────────────────────────────────────────────────

const compactTitle = computed(() => {
  if (props.item.kind === "diagram") return `${props.item.layout.toUpperCase()} · ${props.item.nodes.length} Knoten`;
  if (props.item.kind === "chart") return `${chartTypeLabel(props.item.chartType)} · ${props.item.series.length} Serien`;
  if (props.item.kind === "map") return `${props.item.markers.length} Marker · ${props.item.routes.length} Routen`;
  if (props.item.kind === "image") return props.item.caption ?? props.item.altText;
  return props.item.text.slice(0, 90);
});

// ── Marker visibility toggles ─────────────────────────────────────────────────

const hiddenKinds = ref<Set<string>>(new Set());

watch(() => props.item.id, () => { hiddenKinds.value = new Set(); });

const markerKindStats = computed(() => {
  if (props.item.kind !== "map") return [];
  const counts = new Map<string, number>();
  for (const m of (props.item as CanvasMapItem).markers) {
    counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([kind, count]) => ({ kind, count }));
});

const visibleMarkers = computed(() => {
  if (props.item.kind !== "map") return [];
  return (props.item as CanvasMapItem).markers.filter((m) => !hiddenKinds.value.has(m.kind));
});

function toggleKind(kind: string) {
  const next = new Set(hiddenKinds.value);
  next.has(kind) ? next.delete(kind) : next.add(kind);
  hiddenKinds.value = next;
}

const compactMapOptions = {
  dragging: false,
  touchZoom: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  zoomControl: false,
  attributionControl: false,
};

const fullMapOptions = {
  zoomControl: true,
  attributionControl: true,
};
</script>

<template>
  <!-- ── COMPACT ─────────────────────────────────────────────────────────── -->
  <article v-if="compact" class="artifact artifact-compact" :data-kind="item.kind" :title="compactTitle">

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
        <g v-for="edge in diagramLayout.edges" :key="`${edge.from}-${edge.to}`">
          <line
            :x1="diagramLayout.nodes.find((n) => n.id === edge.from)?.x ?? 400"
            :y1="diagramLayout.nodes.find((n) => n.id === edge.from)?.y ?? 210"
            :x2="diagramLayout.nodes.find((n) => n.id === edge.to)?.x ?? 400"
            :y2="diagramLayout.nodes.find((n) => n.id === edge.to)?.y ?? 210"
            class="diagram-edge"
            marker-end="url(#diagram-arrow-compact)"
          />
        </g>
        <g v-for="node in diagramLayout.nodes" :key="node.id">
          <circle :cx="node.x" :cy="node.y" r="32" class="diagram-node-ring compact-node-ring" />
          <circle :cx="node.x" :cy="node.y" r="23" class="diagram-node-core compact-node-core" />
          <text :x="node.x" :y="node.y + 4" text-anchor="middle" class="diagram-node-label compact-node-label">{{ node.label }}</text>
        </g>
      </svg>
    </div>

    <div v-else-if="item.kind === 'chart'" class="compact-slide compact-slide-chart">
      <svg v-if="chartLayout" class="chart-svg compact-chart-svg" viewBox="0 0 800 420" role="img" :aria-label="item.title">
        <g v-for="tick in chartLayout.yTicks" :key="`compact-y-${tick.label}`">
          <line :x1="chartLayout.plot.left" :y1="tick.y" :x2="chartLayout.plot.right" :y2="tick.y" class="chart-grid-line" />
        </g>
        <line
          :x1="chartLayout.plot.left"
          :y1="chartLayout.baselineY"
          :x2="chartLayout.plot.right"
          :y2="chartLayout.baselineY"
          class="chart-axis-line"
        />
        <g v-if="item.chartType === 'bar'">
          <rect
            v-for="bar in chartLayout.bars"
            :key="`${bar.seriesLabel}-${bar.index}`"
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            rx="6"
            class="chart-bar"
            :style="{ '--series-color': bar.color }"
          />
        </g>
        <g v-else>
          <path
            v-for="series in chartLayout.series"
            v-if="item.chartType === 'area'"
            :key="`${series.label}-compact-area`"
            :d="series.areaPath"
            class="chart-area"
            :style="{ '--series-color': series.color }"
          />
          <path
            v-for="series in chartLayout.series"
            v-if="item.chartType === 'line' || item.chartType === 'area'"
            :key="`${series.label}-compact-line`"
            :d="series.linePath"
            class="chart-line"
            :style="{ '--series-color': series.color }"
          />
          <g v-for="series in chartLayout.series" :key="`${series.label}-compact-points`">
            <circle
              v-for="point in series.points"
              :key="`${series.label}-${point.index}`"
              :cx="point.x"
              :cy="point.y"
              :r="item.chartType === 'scatter' ? 6 : 4.5"
              class="chart-point"
              :style="{ '--series-color': series.color }"
            />
          </g>
        </g>
      </svg>
    </div>

    <div v-else-if="item.kind === 'map'" class="compact-slide compact-slide-map">
      <l-map
        :zoom="(item as CanvasMapItem).zoom"
        :center="[(item as CanvasMapItem).center.lat, (item as CanvasMapItem).center.lng]"
        :options="compactMapOptions"
        :use-global-leaflet="false"
        style="height: 100%; width: 100%"
      >
        <l-tile-layer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          layer-type="base"
          name="OSM"
        />
        <l-circle-marker
          v-for="marker in (item as CanvasMapItem).markers"
          :key="marker.id"
          :lat-lng="[marker.point.lat, marker.point.lng]"
          :radius="5"
          :color="markerColor(marker.kind)"
          :fill-color="markerColor(marker.kind)"
          :fill-opacity="0.9"
          :weight="1"
        />
        <l-circle
          v-for="area in (item as CanvasMapItem).areas"
          :key="area.id"
          :lat-lng="[area.center.lat, area.center.lng]"
          :radius="area.radiusMeters"
          :color="area.color ?? '#d97706'"
          :fill-color="area.color ?? '#d97706'"
          :fill-opacity="0.15"
          :weight="1"
        />
        <l-polyline
          v-for="route in (item as CanvasMapItem).routes"
          :key="route.id"
          :lat-lngs="route.points.map((p) => [p.lat, p.lng] as [number, number])"
          :color="route.color ?? '#3b82f6'"
          :weight="2"
        />
        <l-polygon
          v-for="polygon in ((item as CanvasMapItem).polygons ?? [])"
          :key="polygon.id"
          :lat-lngs="polygon.points.map((p) => [p.lat, p.lng] as [number, number])"
          :color="polygon.color ?? '#ef4444'"
          :fill-color="polygon.color ?? '#ef4444'"
          :fill-opacity="polygon.fillOpacity ?? 0.15"
          :weight="1"
        />
      </l-map>
    </div>

    <div v-else-if="item.kind === 'image'" class="compact-slide compact-slide-image">
      <img v-if="item.sourceUrl" :src="item.sourceUrl" :alt="item.altText" />
      <div v-else class="compact-placeholder compact-image-placeholder" />
    </div>

    <div v-else class="compact-slide compact-slide-note">
      <div class="compact-note-mark" />
    </div>
  </article>

  <!-- ── DIAGRAM (full) ──────────────────────────────────────────────────── -->
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
      <g v-for="edge in diagramLayout.edges" :key="`${edge.from}-${edge.to}`">
        <line
          :x1="diagramLayout.nodes.find((n) => n.id === edge.from)?.x ?? 400"
          :y1="diagramLayout.nodes.find((n) => n.id === edge.from)?.y ?? 210"
          :x2="diagramLayout.nodes.find((n) => n.id === edge.to)?.x ?? 400"
          :y2="diagramLayout.nodes.find((n) => n.id === edge.to)?.y ?? 210"
          class="diagram-edge"
          marker-end="url(#diagram-arrow)"
        />
      </g>
      <g v-for="node in diagramLayout.nodes" :key="node.id">
        <circle :cx="node.x" :cy="node.y" r="38" class="diagram-node-ring" />
        <circle :cx="node.x" :cy="node.y" r="28" class="diagram-node-core" />
        <text :x="node.x" :y="node.y - 4" text-anchor="middle" class="diagram-node-label">{{ node.label }}</text>
        <text v-if="node.detail" :x="node.x" :y="node.y + 16" text-anchor="middle" class="diagram-node-detail">{{ node.detail }}</text>
      </g>
      <text v-if="item.edges.length === 0" x="400" y="392" text-anchor="middle" class="diagram-empty">
        Kein Verbindungsnetz angegeben – Diagramm bleibt als Platzhalter sichtbar.
      </text>
    </svg>
  </article>

  <!-- ── CHART (full) ────────────────────────────────────────────────────── -->
  <article v-else-if="item.kind === 'chart'" class="artifact artifact-chart">
    <div class="artifact-meta">
      <span class="artifact-kind">{{ chartTypeLabel(item.chartType) }}-Chart</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>

    <svg v-if="chartLayout" class="chart-svg" viewBox="0 0 800 420" role="img" :aria-label="item.title">
      <g v-for="tick in chartLayout.yTicks" :key="`y-${tick.label}`">
        <line :x1="chartLayout.plot.left" :y1="tick.y" :x2="chartLayout.plot.right" :y2="tick.y" class="chart-grid-line" />
        <text :x="chartLayout.plot.left - 12" :y="tick.y + 4" text-anchor="end" class="chart-axis-text">{{ tick.label }}</text>
      </g>

      <line
        :x1="chartLayout.plot.left"
        :y1="chartLayout.baselineY"
        :x2="chartLayout.plot.right"
        :y2="chartLayout.baselineY"
        class="chart-axis-line"
      />
      <line
        :x1="chartLayout.plot.left"
        :y1="chartLayout.plot.top"
        :x2="chartLayout.plot.left"
        :y2="chartLayout.plot.bottom"
        class="chart-axis-line chart-axis-line--muted"
      />

      <g v-for="tick in chartLayout.xTicks" :key="`x-${tick.index}`">
        <line :x1="tick.x" :y1="chartLayout.plot.bottom" :x2="tick.x" :y2="chartLayout.plot.bottom + 8" class="chart-axis-line chart-axis-line--muted" />
        <text :x="tick.x" :y="chartLayout.plot.bottom + 24" text-anchor="middle" class="chart-axis-text chart-axis-text--x">{{ tick.label }}</text>
      </g>

      <text
        v-if="chartLayout.yUnit"
        :x="chartLayout.plot.left - 56"
        :y="chartLayout.plot.top - 8"
        text-anchor="start"
        class="chart-unit chart-unit--y"
      >
        {{ chartLayout.yUnit }}
      </text>
      <text
        v-if="chartLayout.xUnit"
        :x="chartLayout.plot.right"
        :y="chartLayout.plot.bottom + 44"
        text-anchor="end"
        class="chart-unit"
      >
        {{ chartLayout.xUnit }}
      </text>

      <g v-if="item.chartType === 'bar'">
        <rect
          v-for="bar in chartLayout.bars"
          :key="`${bar.seriesLabel}-${bar.index}`"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          rx="7"
          class="chart-bar"
          :style="{ '--series-color': bar.color }"
        />
      </g>

      <g v-else>
        <path
          v-for="series in chartLayout.series"
          v-if="item.chartType === 'area'"
          :key="`${series.label}-area`"
          :d="series.areaPath"
          class="chart-area"
          :style="{ '--series-color': series.color }"
        />
        <path
          v-for="series in chartLayout.series"
          v-if="item.chartType === 'line' || item.chartType === 'area'"
          :key="`${series.label}-line`"
          :d="series.linePath"
          class="chart-line"
          :style="{ '--series-color': series.color }"
        />
        <g v-for="series in chartLayout.series" :key="`${series.label}-points`">
          <circle
            v-for="point in series.points"
            :key="`${series.label}-point-${point.index}`"
            :cx="point.x"
            :cy="point.y"
            :r="item.chartType === 'scatter' ? 7 : 5"
            class="chart-point"
            :style="{ '--series-color': series.color }"
          />
        </g>
      </g>
    </svg>

    <div class="chart-meta-bar">
      <span>{{ item.xLabels.length }} Werte</span>
      <span v-if="item.xUnit">x: {{ item.xUnit }}</span>
      <span v-if="item.yUnit">y: {{ item.yUnit }}</span>
      <span>{{ item.series.length }} Serien</span>
    </div>

    <div v-if="chartLayout && chartLayout.series.length > 0" class="chart-legend">
      <span v-for="series in chartLayout.series" :key="series.label" class="chart-legend-item">
        <span class="chart-legend-swatch" :style="{ '--legend-color': series.color }"></span>
        <strong>{{ series.label }}</strong>
        <span>{{ series.values.length }} Punkte</span>
      </span>
    </div>
  </article>

  <!-- ── IMAGE (full) ────────────────────────────────────────────────────── -->
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

  <!-- ── MAP (full) ──────────────────────────────────────────────────────── -->
  <article v-else-if="item.kind === 'map'" class="artifact artifact-map">
    <div class="artifact-meta">
      <span class="artifact-kind">OSM-Karte</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>

    <div class="map-leaflet-frame">
      <l-map
        :zoom="(item as CanvasMapItem).zoom"
        :center="[(item as CanvasMapItem).center.lat, (item as CanvasMapItem).center.lng]"
        :options="fullMapOptions"
        :use-global-leaflet="false"
        style="height: 100%; width: 100%"
      >
        <l-tile-layer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          layer-type="base"
          name="OpenStreetMap"
        />

        <l-marker
          v-for="marker in visibleMarkers"
          :key="marker.id"
          :lat-lng="[marker.point.lat, marker.point.lng]"
          :icon="markerIcon(marker)"
        >
          <l-tooltip direction="top" :offset="[0, -44]">
            <div class="map-tooltip-content">
              <strong>{{ marker.label }}</strong>
              <span class="map-tooltip-kind">{{ marker.kind }}</span>
              <p v-if="marker.kind === 'hydrant' && marker.flowRateLpm !== undefined" class="map-tooltip-metric">
                Durchfluss: {{ formatFlowRate(marker.flowRateLpm) }}
                <span v-if="marker.flowRateEstimated"> · geschätzt</span>
              </p>
              <p v-if="marker.note" class="map-tooltip-note">{{ marker.note }}</p>
            </div>
          </l-tooltip>
        </l-marker>

        <l-circle
          v-for="area in (item as CanvasMapItem).areas"
          :key="area.id"
          :lat-lng="[area.center.lat, area.center.lng]"
          :radius="area.radiusMeters"
          :color="area.color ?? '#d97706'"
          :fill-color="area.color ?? '#d97706'"
          :fill-opacity="0.12"
          :weight="2"
        >
          <l-tooltip :permanent="true">
            <strong>{{ area.label }}</strong>
            <span> · {{ area.radiusMeters }}m</span>
          </l-tooltip>
        </l-circle>

        <l-polyline
          v-for="route in (item as CanvasMapItem).routes"
          :key="route.id"
          :lat-lngs="route.points.map((p) => [p.lat, p.lng] as [number, number])"
          :color="route.color ?? '#3b82f6'"
          :weight="4"
          :opacity="0.85"
        >
          <l-tooltip>
            <strong>{{ route.name }}</strong>
            <span v-if="route.description"> · {{ route.description }}</span>
          </l-tooltip>
        </l-polyline>

        <l-polygon
          v-for="polygon in ((item as CanvasMapItem).polygons ?? [])"
          :key="polygon.id"
          :lat-lngs="polygon.points.map((p) => [p.lat, p.lng] as [number, number])"
          :color="polygon.color ?? '#ef4444'"
          :fill-color="polygon.color ?? '#ef4444'"
          :fill-opacity="polygon.fillOpacity ?? 0.15"
          :weight="2"
        >
          <l-tooltip :permanent="true">{{ polygon.label }}</l-tooltip>
        </l-polygon>

        <l-marker
          v-for="lbl in ((item as CanvasMapItem).labels ?? [])"
          :key="lbl.id"
          :lat-lng="[lbl.lat, lbl.lng]"
          :icon="labelIcon(lbl)"
        />

        <l-marker
          v-for="wind in ((item as CanvasMapItem).winds ?? [])"
          :key="wind.id"
          :lat-lng="[wind.lat, wind.lng]"
          :icon="windIcon(wind)"
        >
          <l-tooltip direction="top">
            <strong>Wind {{ wind.directionDeg }}°</strong>
            <span v-if="wind.speedKmh"> · {{ wind.speedKmh }} km/h</span>
            <span v-if="wind.label"> · {{ wind.label }}</span>
          </l-tooltip>
        </l-marker>
      </l-map>
    </div>

    <div class="map-meta-bar">
      <span class="map-center-label">{{ (item as CanvasMapItem).centerLabel }}</span>
      <span class="map-stats">
        {{ (item as CanvasMapItem).markers.length }} Marker ·
        {{ (item as CanvasMapItem).areas.length }} Bereiche ·
        {{ (item as CanvasMapItem).routes.length }} Routen
      </span>
    </div>

    <div v-if="markerKindStats.length > 0" class="map-visibility-bar">
      <span class="map-visibility-label">Sichtbarkeit</span>
      <button
        v-for="stat in markerKindStats"
        :key="stat.kind"
        type="button"
        class="map-kind-chip"
        :class="{ 'map-kind-chip--hidden': hiddenKinds.has(stat.kind) }"
        :style="{ '--chip-color': markerColor(stat.kind) }"
        :title="hiddenKinds.has(stat.kind) ? `${stat.kind} einblenden` : `${stat.kind} ausblenden`"
        @click="toggleKind(stat.kind)"
      >
        <span class="map-kind-dot"></span>
        <span class="map-kind-letter">{{ KIND_CONFIG[stat.kind]?.label ?? stat.kind[0].toUpperCase() }}</span>
        <span class="map-kind-count">{{ stat.count }}</span>
      </button>
    </div>

    <div v-if="(item as CanvasMapItem).routes.length > 0" class="map-route-list">
      <div v-for="route in (item as CanvasMapItem).routes" :key="route.id" class="map-route-card">
        <strong>{{ route.name }}</strong>
        <p>{{ route.description }}</p>
      </div>
    </div>
  </article>

  <!-- ── NOTE (full) ─────────────────────────────────────────────────────── -->
  <article v-else class="artifact artifact-note">
    <div class="artifact-meta">
      <span class="artifact-kind">Notiz</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.summary }}</p>
    </div>
    <p class="note-text">{{ item.text }}</p>
  </article>
</template>
