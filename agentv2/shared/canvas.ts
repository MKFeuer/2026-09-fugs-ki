export type CanvasItemKind = "diagram" | "image" | "map" | "note" | "chart";
export const CANVAS_CHART_TYPES = ["bar", "line", "area", "scatter"] as const;
export type CanvasChartType = (typeof CANVAS_CHART_TYPES)[number];

export interface CanvasChartSeries {
  label: string;
  color?: string;
  values: number[];
}

export interface CanvasChartItem {
  id: string;
  createdAt: string;
  kind: "chart";
  title: string;
  summary: string;
  chartType: CanvasChartType;
  xLabels: string[];
  yUnit?: string;
  xUnit?: string;
  series: CanvasChartSeries[];
}

export type CanvasDiagramLayout = "flow" | "radial" | "timeline" | "matrix";

export interface CanvasDiagramNode {
  id: string;
  label: string;
  detail?: string;
}

export interface CanvasDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CanvasDiagramItem {
  id: string;
  createdAt: string;
  kind: "diagram";
  title: string;
  summary: string;
  layout: CanvasDiagramLayout;
  nodes: CanvasDiagramNode[];
  edges: CanvasDiagramEdge[];
}

export interface CanvasImageItem {
  id: string;
  createdAt: string;
  kind: "image";
  title: string;
  summary: string;
  sourceUrl?: string;
  altText: string;
  caption?: string;
}

export interface CanvasGeoPoint {
  lat: number;
  lng: number;
}

export interface CanvasMapMarker {
  id: string;
  label: string;
  point: CanvasGeoPoint;
  kind: "fire" | "hydrant" | "water" | "vehicle" | "point";
  flowRateLpm?: number;
  flowRateEstimated?: boolean;
  note?: string;
}

export interface CanvasMapArea {
  id: string;
  label: string;
  center: CanvasGeoPoint;
  radiusMeters: number;
  color?: string;
}

export interface CanvasMapRoute {
  id: string;
  name: string;
  description: string;
  points: CanvasGeoPoint[];
  color?: string;
}

export interface CanvasMapPolygon {
  id: string;
  label: string;
  points: CanvasGeoPoint[];
  color?: string;
  fillOpacity?: number;
}

export interface CanvasMapLabel {
  id: string;
  text: string;
  lat: number;
  lng: number;
  size?: "sm" | "md" | "lg";
}

export interface CanvasMapWind {
  id: string;
  lat: number;
  lng: number;
  directionDeg: number;
  speedKmh?: number;
  label?: string;
}

export interface CanvasMapItem {
  id: string;
  createdAt: string;
  kind: "map";
  title: string;
  summary: string;
  center: CanvasGeoPoint;
  zoom: number;
  centerLabel: string;
  layers: string[];
  legend: string[];
  markers: CanvasMapMarker[];
  areas: CanvasMapArea[];
  routes: CanvasMapRoute[];
  polygons: CanvasMapPolygon[];
  labels: CanvasMapLabel[];
  winds: CanvasMapWind[];
}

export interface CanvasNoteItem {
  id: string;
  createdAt: string;
  kind: "note";
  title: string;
  summary: string;
  text: string;
}

export type CanvasItem = CanvasDiagramItem | CanvasImageItem | CanvasMapItem | CanvasNoteItem | CanvasChartItem;

export function isCanvasChartType(value: string): value is CanvasChartType {
  return CANVAS_CHART_TYPES.includes(value as CanvasChartType);
}

export function createCanvasChart(
  title: string,
  summary: string,
  chartType: CanvasChartType,
  xLabels: string[],
  series: CanvasChartSeries[],
  yUnit?: string,
  xUnit?: string,
): CanvasChartItem {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "chart",
    title,
    summary,
    chartType,
    xLabels,
    yUnit,
    xUnit,
    series,
  };
}

export function createCanvasNote(title: string, summary: string, text: string): CanvasNoteItem {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "note",
    title,
    summary,
    text,
  };
}
