// React hook that wraps a Grid instance and provides reactive state.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Grid } from '@griddle/core';
import type { GridConfig, GridSnapshot, ReflowOptions, Tile } from '@griddle/core';

export interface UseGriddleInit {
  config: GridConfig;
  tiles?: Tile[];
}

export interface GriddleApi {
  readonly grid: Grid;
  readonly tiles: Tile[];
  readonly config: GridConfig;
  moveTile: (id: string, target: { col: number; row: number }) => boolean;
  resizeTile: (id: string, size: { w: number; h: number }) => boolean;
  addTile: (tile: Tile) => void;
  removeTile: (id: string) => void;
  reflow: (options: ReflowOptions) => boolean;
  updateConfig: (patch: Partial<GridConfig>) => void;
  toJSON: () => GridSnapshot;
  loadJSON: (snap: GridSnapshot) => void;
  /** monotonic version used to trigger re-renders */
  readonly version: number;
}

/** @internal Reactive revision source used by the React adapter. */
export function createGridRevisionStore(grid: Grid) {
  let revision = 0;
  return {
    subscribe(onStoreChange: () => void): () => void {
      return grid.changes.on(() => {
        revision += 1;
        onStoreChange();
      });
    },
    getSnapshot(): number {
      return revision;
    },
  };
}

export function useGriddle(init: UseGriddleInit | (() => UseGriddleInit)): GriddleApi {
  const [grid] = useState(() => {
    const i = typeof init === 'function' ? init() : init;
    return new Grid(i.config, i.tiles ?? []);
  });
  const [revisionStore] = useState(() => createGridRevisionStore(grid));

  const version = useSyncExternalStore(
    revisionStore.subscribe,
    revisionStore.getSnapshot,
    revisionStore.getSnapshot,
  );

  // Stable API object
  const api = useMemo<GriddleApi>(() => {
    return {
      grid,
      get tiles() { return grid.tiles; },
      get config() { return grid.config; },
      moveTile: (id, target) => grid.moveTile(id, target),
      resizeTile: (id, size) => grid.resizeTile(id, size),
      addTile: (t) => grid.addTile(t),
      removeTile: (id) => grid.removeTile(id),
      reflow: (options) => grid.reflow(options),
      updateConfig: (patch) => grid.updateConfig(patch),
      toJSON: () => grid.toJSON(),
      loadJSON: (snap) => grid.loadJSON(snap),
      version: 0,
    };
  }, [grid]);

  // version bump for consumers that prefer plain re-renders
  (api as { version: number }).version = version;

  return api;
}

/** Subscribe to grid changes in any component. */
export function useGridVersion(grid: Grid): number {
  const [v, setV] = useState(0);
  useEffect(() => grid.changes.on(() => setV((x) => x + 1)), [grid]);
  return v;
}
