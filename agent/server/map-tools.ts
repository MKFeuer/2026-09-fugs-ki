import { tool } from "ai";
import { z } from "zod";
import type { MapData } from "../shared/map-types";

const geoPointSchema = z.object({
  lat: z.number().describe("Breitengrad (latitude)"),
  lng: z.number().describe("Längengrad (longitude)"),
});

const markerKindSchema = z.enum(["fire", "hydrant", "water", "vehicle", "point"]);

const markerSchema = z.object({
  label: z.string().describe("Beschriftung des Markers"),
  kind: markerKindSchema.describe(
    "Art: fire=Brandstelle, hydrant=Hydrant, water=Wasserentnahme, vehicle=Fahrzeug, point=Allgemein",
  ),
  lat: z.number(),
  lng: z.number(),
  flowRateLpm: z.number().optional().describe("Durchflussrate in l/min (nur bei Hydranten/Wasser)"),
  flowRateEstimated: z.boolean().optional().describe("Ob die Durchflussrate geschätzt ist"),
  note: z.string().optional(),
});

const areaSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().describe("Radius in Metern"),
  color: z.string().optional().describe("CSS-Farbe, z.B. '#ff0000' oder 'red'"),
});

const routeSchema = z.object({
  name: z.string(),
  description: z.string(),
  points: z.array(geoPointSchema).min(2),
  color: z.string().optional(),
});

const polygonSchema = z.object({
  label: z.string(),
  points: z.array(geoPointSchema).min(3),
  color: z.string().optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
});

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

export function createMapTools(
  getMap: () => MapData | null,
  setMap: (data: MapData | null) => void,
) {
  return {
    create_map: tool({
      description:
        "Erstellt eine neue Lagekarte mit Zentrum, Zoom, Markern, Bereichen, Routen und Legende. Ersetzt eine bestehende Karte.",
      inputSchema: z.object({
        title: z.string().describe("Titel der Karte"),
        summary: z.string().describe("Kurzbeschreibung der Lage"),
        centerLabel: z.string().describe("Bezeichnung des Kartenzentrums (z.B. Adresse)"),
        centerLat: z.number(),
        centerLng: z.number(),
        zoom: z.number().min(1).max(19).describe("Zoom-Stufe (1=Welt, 15=Straße, 18=Gebäude)"),
        markers: z.array(markerSchema).optional().default([]),
        areas: z.array(areaSchema).optional().default([]),
        routes: z.array(routeSchema).optional().default([]),
        polygons: z.array(polygonSchema).optional().default([]),
        legend: z.array(z.string()).optional().default([]),
      }),
      execute: async (input) => {
        console.log(`[map-tool] create_map called: "${input.title}" at ${input.centerLat},${input.centerLng}`);
        const mapData: MapData = {
          id: genId("map"),
          title: input.title,
          summary: input.summary,
          center: { lat: input.centerLat, lng: input.centerLng },
          zoom: input.zoom,
          centerLabel: input.centerLabel,
          markers: input.markers.map((m) => ({
            id: genId("mk"),
            label: m.label,
            point: { lat: m.lat, lng: m.lng },
            kind: m.kind,
            flowRateLpm: m.flowRateLpm,
            flowRateEstimated: m.flowRateEstimated,
            note: m.note,
          })),
          areas: input.areas.map((a) => ({
            id: genId("ar"),
            label: a.label,
            center: { lat: a.lat, lng: a.lng },
            radiusMeters: a.radiusMeters,
            color: a.color,
          })),
          routes: input.routes.map((r) => ({
            id: genId("rt"),
            name: r.name,
            description: r.description,
            points: r.points,
            color: r.color,
          })),
          polygons: input.polygons.map((p) => ({
            id: genId("pg"),
            label: p.label,
            points: p.points,
            color: p.color,
            fillOpacity: p.fillOpacity,
          })),
          legend: input.legend,
        };
        setMap(mapData);
        console.log(`[map-tool] map stored with id=${mapData.id}`);
        const counts = [
          mapData.markers.length && `${mapData.markers.length} Marker`,
          mapData.areas.length && `${mapData.areas.length} Bereiche`,
          mapData.routes.length && `${mapData.routes.length} Routen`,
          mapData.polygons.length && `${mapData.polygons.length} Polygone`,
        ]
          .filter(Boolean)
          .join(", ");
        return `Lagekarte "${input.title}" angelegt (${counts || "leer"}). Zentrum: ${input.centerLabel}.`;
      },
    }),

    map_add_marker: tool({
      description: "Fügt einen einzelnen Marker zur bestehenden Karte hinzu.",
      inputSchema: markerSchema,
      execute: async (input) => {
        const map = getMap();
        if (!map)
          return "Fehler: Keine Karte vorhanden. Erstelle zuerst eine Karte mit create_map.";
        map.markers.push({
          id: genId("mk"),
          label: input.label,
          point: { lat: input.lat, lng: input.lng },
          kind: input.kind,
          flowRateLpm: input.flowRateLpm,
          flowRateEstimated: input.flowRateEstimated,
          note: input.note,
        });
        return `Marker "${input.label}" (${input.kind}) hinzugefügt.`;
      },
    }),

    map_add_area: tool({
      description:
        "Fügt einen Kreisbereich (Sperrzone, Gefahrenbereich) zur bestehenden Karte hinzu.",
      inputSchema: areaSchema,
      execute: async (input) => {
        const map = getMap();
        if (!map)
          return "Fehler: Keine Karte vorhanden. Erstelle zuerst eine Karte mit create_map.";
        map.areas.push({
          id: genId("ar"),
          label: input.label,
          center: { lat: input.lat, lng: input.lng },
          radiusMeters: input.radiusMeters,
          color: input.color,
        });
        return `Bereich "${input.label}" (${input.radiusMeters}m Radius) hinzugefügt.`;
      },
    }),

    map_add_route: tool({
      description: "Fügt eine Route (Pendelstrecke, Zufahrt) zur bestehenden Karte hinzu.",
      inputSchema: routeSchema,
      execute: async (input) => {
        const map = getMap();
        if (!map)
          return "Fehler: Keine Karte vorhanden. Erstelle zuerst eine Karte mit create_map.";
        map.routes.push({
          id: genId("rt"),
          name: input.name,
          description: input.description,
          points: input.points,
          color: input.color,
        });
        return `Route "${input.name}" (${input.points.length} Wegpunkte) hinzugefügt.`;
      },
    }),

    map_add_polygon: tool({
      description:
        "Fügt ein Polygon (Evakuierungszone, Gebäudeumriss) zur bestehenden Karte hinzu.",
      inputSchema: polygonSchema,
      execute: async (input) => {
        const map = getMap();
        if (!map)
          return "Fehler: Keine Karte vorhanden. Erstelle zuerst eine Karte mit create_map.";
        map.polygons.push({
          id: genId("pg"),
          label: input.label,
          points: input.points,
          color: input.color,
          fillOpacity: input.fillOpacity,
        });
        return `Polygon "${input.label}" (${input.points.length} Punkte) hinzugefügt.`;
      },
    }),

    clear_map: tool({
      description: "Löscht die aktuelle Karte.",
      inputSchema: z.object({}),
      execute: async () => {
        setMap(null);
        return "Karte gelöscht.";
      },
    }),
  };
}
