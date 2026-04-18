import { computed, ref } from "vue";
import type { CanvasMapItem } from "../../shared/canvas";

export interface MapViewModel {
  zoom: number;
  center: { lat: number; lng: number };
  visibleLayers: Set<string>;
}

export function useMapInteraction(mapItem: Readonly<CanvasMapItem>) {
  const viewModel = ref<MapViewModel>({
    zoom: mapItem.zoom,
    center: { ...mapItem.center },
    visibleLayers: new Set(mapItem.layers),
  });

  const MIN_ZOOM = 0;
  const MAX_ZOOM = 19;

  function zoomIn() {
    if (viewModel.value.zoom < MAX_ZOOM) {
      viewModel.value = {
        ...viewModel.value,
        zoom: viewModel.value.zoom + 1,
      };
    }
  }

  function zoomOut() {
    if (viewModel.value.zoom > MIN_ZOOM) {
      viewModel.value = {
        ...viewModel.value,
        zoom: viewModel.value.zoom - 1,
      };
    }
  }

  function pan(deltaLat: number, deltaLng: number) {
    const degreesPerPixel = 360 / (256 * Math.pow(2, viewModel.value.zoom));
    viewModel.value = {
      ...viewModel.value,
      center: {
        lat: viewModel.value.center.lat - deltaLat * degreesPerPixel,
        lng: viewModel.value.center.lng + deltaLng * degreesPerPixel,
      },
    };
  }

  function fitToContent() {
    // Reset to original center and zoom
    viewModel.value = {
      zoom: mapItem.zoom,
      center: { ...mapItem.center },
      visibleLayers: viewModel.value.visibleLayers,
    };
  }

  function toggleLayer(layerName: string) {
    const newLayers = new Set(viewModel.value.visibleLayers);
    if (newLayers.has(layerName)) {
      newLayers.delete(layerName);
    } else {
      newLayers.add(layerName);
    }
    viewModel.value = {
      ...viewModel.value,
      visibleLayers: newLayers,
    };
  }

  function setLayerVisibility(layerName: string, visible: boolean) {
    const newLayers = new Set(viewModel.value.visibleLayers);
    if (visible) {
      newLayers.add(layerName);
    } else {
      newLayers.delete(layerName);
    }
    viewModel.value = {
      ...viewModel.value,
      visibleLayers: newLayers,
    };
  }

  const isLayerVisible = computed(
    () => (layerName: string) => viewModel.value.visibleLayers.has(layerName),
  );

  return {
    viewModel,
    zoomIn,
    zoomOut,
    pan,
    fitToContent,
    toggleLayer,
    setLayerVisibility,
    isLayerVisible,
  };
}
