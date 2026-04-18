import L from "leaflet";
import { Circle, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { MapData, MarkerKind } from "../../shared/map-types";

const KIND_CONFIG: Record<MarkerKind, { color: string; label: string }> = {
  fire: { color: "#c53030", label: "F" },
  hydrant: { color: "#2b6cb0", label: "H" },
  water: { color: "#0694a2", label: "W" },
  vehicle: { color: "#c05621", label: "E" },
  point: { color: "#553c9a", label: "P" },
};

function markerIcon(kind: MarkerKind, name: string): L.DivIcon {
  const cfg = KIND_CONFIG[kind] ?? KIND_CONFIG.point;
  const shortName = name.length > 14 ? `${name.slice(0, 13)}\u2026` : name;
  return L.divIcon({
    html: `<div class="map-pin-group">
      <div class="map-pin" style="--pin-color:${cfg.color}"><span>${cfg.label}</span></div>
      <div class="map-pin-name">${shortName}</div>
    </div>`,
    className: "",
    iconSize: [80, 52],
    iconAnchor: [40, 38],
    popupAnchor: [0, -42],
  });
}

interface MapPanelProps {
  mapData: MapData;
  onClose: () => void;
}

export function MapPanel({ mapData, onClose }: MapPanelProps) {
  const center: [number, number] = [mapData.center.lat, mapData.center.lng];

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text)]">
            {mapData.title}
          </h2>
          <p className="truncate text-xs text-[var(--color-text-muted)]">{mapData.summary}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Schließen"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer
          center={center}
          zoom={mapData.zoom}
          className="h-full w-full"
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {mapData.markers.map((m) => (
            <Marker
              key={m.id}
              position={[m.point.lat, m.point.lng]}
              icon={markerIcon(m.kind, m.label)}
            >
              <Tooltip direction="top" offset={[0, -44]}>
                <strong>{m.label}</strong>
                {m.flowRateLpm != null && (
                  <>
                    <br />
                    {m.flowRateLpm} l/min{m.flowRateEstimated ? " (geschätzt)" : ""}
                  </>
                )}
                {m.note && (
                  <>
                    <br />
                    {m.note}
                  </>
                )}
              </Tooltip>
            </Marker>
          ))}

          {mapData.areas.map((a) => (
            <Circle
              key={a.id}
              center={[a.center.lat, a.center.lng]}
              radius={a.radiusMeters}
              pathOptions={{
                color: a.color ?? "#e53e3e",
                fillOpacity: 0.15,
                weight: 2,
              }}
            >
              <Tooltip>{a.label}</Tooltip>
            </Circle>
          ))}

          {mapData.routes.map((r) => (
            <Polyline
              key={r.id}
              positions={r.points.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: r.color ?? "#3182ce",
                weight: 3,
                dashArray: "8 4",
              }}
            >
              <Tooltip>{r.name}</Tooltip>
            </Polyline>
          ))}

          {mapData.polygons.map((p) => (
            <Polygon
              key={p.id}
              positions={p.points.map((pt) => [pt.lat, pt.lng] as [number, number])}
              pathOptions={{
                color: p.color ?? "#805ad5",
                fillOpacity: p.fillOpacity ?? 0.2,
                weight: 2,
              }}
            >
              <Tooltip>{p.label}</Tooltip>
            </Polygon>
          ))}
        </MapContainer>
      </div>

      {/* Legend + stats */}
      {(mapData.legend.length > 0 || mapData.markers.length > 0) && (
        <div className="border-t border-[var(--color-border)] px-4 py-2.5">
          {/* Stats */}
          <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
            {mapData.markers.length > 0 && <span>{mapData.markers.length} Marker</span>}
            {mapData.areas.length > 0 && <span>{mapData.areas.length} Bereiche</span>}
            {mapData.routes.length > 0 && <span>{mapData.routes.length} Routen</span>}
            {mapData.polygons.length > 0 && <span>{mapData.polygons.length} Polygone</span>}
          </div>
          {/* Legend */}
          {mapData.legend.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
              {mapData.legend.map((entry) => (
                <span key={entry}>{entry}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
