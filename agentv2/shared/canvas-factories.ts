import {
  createCanvasChart,
  createCanvasNote,
  isCanvasChartType,
  type CanvasChartItem,
  type CanvasChartType,
  type CanvasDiagramItem,
  type CanvasImageItem,
  type CanvasMapItem,
} from "./canvas";

const FALLBACK_CHART_COLORS = ["#c2410c", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0f766e"];

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toChartType(value: unknown): CanvasChartType {
  const chartType = String(value || "line");
  return isCanvasChartType(chartType) ? chartType : "line";
}

export function createDiagramFactory() {
  return {
    createDiagram: (args: Record<string, any>): CanvasDiagramItem => {
      const layout = args.layout || "flow";
      const nodes = Array.isArray(args.nodes)
        ? args.nodes.map((n: any) => ({
            id: String(n.id || ""),
            label: String(n.label || ""),
            detail: n.detail ? String(n.detail) : undefined,
          }))
        : [];
      const edges = Array.isArray(args.edges)
        ? args.edges.map((e: any) => ({
            from: String(e.from || ""),
            to: String(e.to || ""),
            label: e.label ? String(e.label) : undefined,
          }))
        : [];

      const meta = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      return {
        kind: "diagram",
        title: String(args.title || "Diagramm"),
        summary: String(args.summary || ""),
        layout: layout as "flow" | "radial" | "timeline" | "matrix",
        nodes,
        edges,
        ...meta,
      };
    },
  };
}

export function createMapFactory() {
  return {
    createMap: (args: Record<string, any>): CanvasMapItem => {
      const center = {
        lat: Number(args.center?.lat) || 48.1351,
        lng: Number(args.center?.lng) || 11.582,
      };

      const markers = Array.isArray(args.markers)
        ? args.markers.map((m: any) => ({
            id: String(m.id || ""),
            label: String(m.label || ""),
            point: {
              lat: Number(m.point?.lat) || 0,
              lng: Number(m.point?.lng) || 0,
            },
            kind: (m.kind || "point") as "fire" | "hydrant" | "water" | "vehicle" | "point",
            flowRateLpm: toOptionalNumber(m.flowRateLpm),
            flowRateEstimated: typeof m.flowRateEstimated === "boolean" ? m.flowRateEstimated : undefined,
            note: m.note ? String(m.note) : undefined,
          }))
        : [];

      const areas = Array.isArray(args.areas)
        ? args.areas.map((a: any) => ({
            id: String(a.id || ""),
            label: String(a.label || ""),
            center: {
              lat: Number(a.center?.lat) || 0,
              lng: Number(a.center?.lng) || 0,
            },
            radiusMeters: Number(a.radiusMeters) || 100,
            color: a.color ? String(a.color) : undefined,
          }))
        : [];

      const routes = Array.isArray(args.routes)
        ? args.routes.map((r: any) => ({
            id: String(r.id || ""),
            name: String(r.name || ""),
            description: String(r.description || ""),
            points: Array.isArray(r.points)
              ? r.points.map((p: any) => ({
                  lat: Number(p.lat) || 0,
                  lng: Number(p.lng) || 0,
                }))
              : [],
            color: r.color ? String(r.color) : undefined,
          }))
        : [];

      const meta = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      return {
        kind: "map",
        title: String(args.title || "Karte"),
        summary: String(args.summary || ""),
        center,
        zoom: Number(args.zoom) || 12,
        centerLabel: String(args.centerLabel || "Zentrum"),
        layers: Array.isArray(args.layers) ? args.layers.map(String) : [],
        legend: Array.isArray(args.legend) ? args.legend.map(String) : [],
        markers,
        areas,
        routes,
        polygons: [],
        labels: [],
        winds: [],
        ...meta,
      };
    },
  };
}

export function createChartFactory() {
  return {
    createChart: (args: Record<string, any>): CanvasChartItem => {
      const xLabels = Array.isArray(args.xLabels) ? args.xLabels.map(String) : [];
      const series = Array.isArray(args.series)
        ? args.series.map((entry: any, index: number) => ({
            label: String(entry.label || `Serie ${index + 1}`),
            color: entry.color ? String(entry.color) : FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length],
            values: Array.isArray(entry.values) ? entry.values.map((value: unknown) => Number(value) || 0) : [],
          }))
        : [];

      return createCanvasChart(
        String(args.title || "Chart"),
        String(args.summary || ""),
        toChartType(args.chartType),
        xLabels,
        series,
        args.yUnit ? String(args.yUnit) : undefined,
        args.xUnit ? String(args.xUnit) : undefined,
      );
    },
  };
}

export function createImageFactory() {
  return {
    createImage: (args: Record<string, any>): CanvasImageItem => {
      const meta = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      return {
        kind: "image",
        title: String(args.title || "Bild"),
        summary: String(args.summary || ""),
        sourceUrl: args.sourceUrl ? String(args.sourceUrl) : undefined,
        altText: String(args.altText || ""),
        caption: args.caption ? String(args.caption) : undefined,
        ...meta,
      };
    },
  };
}

export function createNoteFactory() {
  return {
    createNote: (text: string, title = "Notiz", summary = "") => {
      return createCanvasNote(title, summary, text);
    },
  };
}
