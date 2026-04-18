// Canvas item factory and utilities
import {
  createCanvasChart,
  isCanvasChartType,
  type CanvasChartItem,
  type CanvasChartType,
  type CanvasDiagramItem,
  type CanvasImageItem,
  type CanvasMapItem,
  type CanvasNoteItem,
} from "../../shared/canvas";
import type { TurnActionItem } from "../../shared/turn";

export type CanvasDiagramLayout = "flow" | "radial" | "timeline" | "matrix";

export function createCanvasMeta() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function parseToolArguments(text: string) {
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export function toString(value: unknown, fallback: string | undefined = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback ?? "";
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function toObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
}

export function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toNumberArray(value: unknown, label = "Werte"): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const parsed = toNumber(entry, Number.NaN);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label}: Ungültiger Zahlenwert an Position ${index + 1}.`);
    }
    return parsed;
  });
}

export function toDiagramLayout(value: unknown): CanvasDiagramLayout {
  const layout = toString(value, "flow");
  return layout === "radial" || layout === "timeline" || layout === "matrix" ? layout : "flow";
}

export function toChartType(value: unknown): CanvasChartType {
  const chartType = toString(value, "line");
  return isCanvasChartType(chartType) ? chartType : "line";
}

export function createDiagramItem(args: Record<string, unknown>): CanvasDiagramItem {
  const meta = createCanvasMeta();
  const nodes = toObjectArray(args.nodes).map((node) => ({
    id: toString(node.id),
    label: toString(node.label),
    detail: toString(node.detail, undefined),
  }));
  const edges = toObjectArray(args.edges).map((edge) => ({
    from: toString(edge.from),
    to: toString(edge.to),
    label: toString(edge.label, undefined),
  }));

  if (nodes.length === 0) throw new Error("Diagramm benötigt nodes.");
  if (edges.some((edge) => !edge.from || !edge.to)) throw new Error("Diagramm edges benötigen from/to.");

  return {
    ...meta,
    kind: "diagram",
    title: toString(args.title, "Diagramm"),
    summary: toString(args.summary, "Erstelltes Diagramm"),
    layout: toDiagramLayout(args.layout),
    nodes,
    edges,
  };
}

export function createImageItem(args: Record<string, unknown>): CanvasImageItem {
  const meta = createCanvasMeta();
  return {
    ...meta,
    kind: "image",
    title: toString(args.title, "Bild"),
    summary: toString(args.summary, "Bild auf dem Canvas"),
    sourceUrl: toString(args.sourceUrl, undefined),
    altText: toString(args.altText, "Bildvorschau"),
    caption: toString(args.caption, undefined),
  };
}

export function createChartItem(args: Record<string, unknown>): CanvasChartItem {
  const xLabels = toStringArray(args.xLabels);
  const series = toObjectArray(args.series).map((entry, index) => ({
    label: toString(entry.label, `Serie ${index + 1}`),
    color: toString(entry.color, undefined),
    values: toNumberArray(entry.values, `Serie ${index + 1}`),
  }));

  if (xLabels.length === 0) throw new Error("Chart benötigt xLabels.");
  if (series.length === 0) throw new Error("Chart benötigt mindestens eine Serie.");
  if (series.some((entry) => entry.values.length !== xLabels.length)) {
    throw new Error("Jede Serie muss genau so viele Werte wie xLabels enthalten.");
  }

  return createCanvasChart(
    toString(args.title, "Chart"),
    toString(args.summary, "Zahlenreihe auf dem Canvas"),
    toChartType(args.chartType),
    xLabels,
    series,
    toString(args.yUnit, undefined),
    toString(args.xUnit, undefined),
  );
}

export function createMapItem(args: Record<string, unknown>): CanvasMapItem {
  const meta = createCanvasMeta();
  const center = args.center && typeof args.center === "object" ? (args.center as Record<string, unknown>) : {};
  return {
    ...meta,
    kind: "map",
    title: toString(args.title, "Lageplan"),
    summary: toString(args.summary, "Karten-/Lageplan-Ansicht"),
    center: {
      lat: toNumber(args.centerLat ?? center.lat, 48.137),
      lng: toNumber(args.centerLng ?? center.lng, 11.575),
    },
    zoom: toNumber(args.zoom, 14),
    centerLabel: toString(args.centerLabel, "Einsatz"),
    layers: toStringArray(args.layers),
    legend: toStringArray(args.legend),
    markers: toObjectArray(args.markers).map((marker, index) => {
      const markerPoint = marker.point && typeof marker.point === "object" ? (marker.point as Record<string, unknown>) : {};

      return {
        id: toString(marker.id, `marker-${index}`),
        label: toString(marker.label, "Marker"),
        point: {
          lat: toNumber(marker.lat ?? markerPoint.lat, 48.137),
          lng: toNumber(marker.lng ?? markerPoint.lng, 11.575),
        },
        kind: (toString(marker.kind, "point") as CanvasMapItem["markers"][number]["kind"]) ?? "point",
        flowRateLpm: toOptionalNumber(marker.flowRateLpm),
        flowRateEstimated: typeof marker.flowRateEstimated === "boolean" ? marker.flowRateEstimated : undefined,
        note: toString(marker.note, undefined),
      };
    }),
    areas: toObjectArray(args.areas).map((area, index) => {
      const areaCenter = area.center && typeof area.center === "object" ? (area.center as Record<string, unknown>) : {};

      return {
        id: toString(area.id, `area-${index}`),
        label: toString(area.label, "Bereich"),
        center: {
          lat: toNumber(area.lat ?? areaCenter.lat, 48.137),
          lng: toNumber(area.lng ?? areaCenter.lng, 11.575),
        },
        radiusMeters: toNumber(area.radiusMeters, 500),
        color: toString(area.color, undefined),
      };
    }),
    routes: toObjectArray(args.routes).map((route, index) => ({
      id: toString(route.id, `route-${index}`),
      name: toString(route.name, "Route"),
      description: toString(route.description, ""),
      points: toObjectArray(route.points).map((point) => ({
        lat: toNumber(point.lat, 48.137),
        lng: toNumber(point.lng, 11.575),
      })),
      color: toString(route.color, undefined),
    })),
    polygons: [],
    labels: [],
    winds: [],
  };
}

export function createNoteItem(args: Record<string, unknown>): CanvasNoteItem {
  return {
    ...createCanvasMeta(),
    kind: "note",
    title: toString(args.title, "Notiz"),
    summary: toString(args.summary, "Canvas-Notiz"),
    text: toString(args.text, "Keine Details angegeben."),
  };
}
