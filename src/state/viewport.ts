/**
 * Pan and zoom, kept apart from the application store.
 *
 * The viewport changes on every frame of a pan or a pinch. Living in its own
 * store means nothing that renders the diagram subscribes to it: the canvas
 * writes the transform straight onto the DOM, and only the zoom readout
 * re-renders, and only when the scale changes.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface Viewport {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

interface ViewportState {
  viewport: Viewport;
  setViewport: (viewport: Viewport) => void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  viewport: { scale: 1, x: 0, y: 0 },
  setViewport: (viewport) => set({ viewport }),
}));

export function getViewport(): Viewport {
  return viewportStore.getState().viewport;
}

export function setViewport(viewport: Viewport): void {
  viewportStore.getState().setViewport(viewport);
}

export function useZoom(): number {
  return useStore(viewportStore, (state) => state.viewport.scale);
}
