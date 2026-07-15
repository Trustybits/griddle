// Vue composable that wraps a Grid instance with reactive state.

import { onScopeDispose, ref, shallowRef } from 'vue';
import { Grid } from '@griddle/core';
import type { GridConfig, GridSnapshot, ReflowOptions, Tile } from '@griddle/core';

export interface UseGriddleInit {
  config: GridConfig;
  tiles?: Tile[];
}

export function useGriddle(init: UseGriddleInit) {
  const grid = new Grid(init.config, init.tiles ?? []);

  // Reactive mirrors of tiles and config. We re-assign on changes.
  const tiles = shallowRef<Tile[]>(grid.tiles);
  const config = shallowRef<GridConfig>(grid.config);
  const version = ref(0);

  const off = grid.changes.on(() => {
    tiles.value = grid.tiles;
    config.value = grid.config;
    version.value++;
  });
  onScopeDispose(off);

  const api = {
    grid,
    tiles,
    config,
    version,
    moveTile: (id: string, target: { col: number; row: number }) => grid.moveTile(id, target),
    resizeTile: (id: string, size: { w: number; h: number }) => grid.resizeTile(id, size),
    addTile: (t: Tile) => grid.addTile(t),
    removeTile: (id: string) => grid.removeTile(id),
    reflow: (options: ReflowOptions) => grid.reflow(options),
    updateConfig: (patch: Partial<GridConfig>) => grid.updateConfig(patch),
    toJSON: () => grid.toJSON(),
    loadJSON: (snap: GridSnapshot) => grid.loadJSON(snap),
  };
  return api;
}

export type GriddleApi = ReturnType<typeof useGriddle>;
