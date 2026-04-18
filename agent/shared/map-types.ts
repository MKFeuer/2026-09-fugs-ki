export interface GeoPoint {
  lat: number;
  lng: number;
}

export type MarkerKind = "fire" | "hydrant" | "water" | "vehicle" | "point";

export interface MapMarker {
  id: string;
  label: string;
  point: GeoPoint;
  kind: MarkerKind;
  flowRateLpm?: number;
  flowRateEstimated?: boolean;
  note?: string;
}

export interface MapArea {
  id: string;
  label: string;
  center: GeoPoint;
  radiusMeters: number;
  color?: string;
}

export interface MapRoute {
  id: string;
  name: string;
  description: string;
  points: GeoPoint[];
  color?: string;
}

export interface MapPolygon {
  id: string;
  label: string;
  points: GeoPoint[];
  color?: string;
  fillOpacity?: number;
}

export interface MapData {
  id: string;
  title: string;
  summary: string;
  center: GeoPoint;
  zoom: number;
  centerLabel: string;
  markers: MapMarker[];
  areas: MapArea[];
  routes: MapRoute[];
  polygons: MapPolygon[];
  legend: string[];
}
