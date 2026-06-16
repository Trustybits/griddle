// Svelte store that wraps a Grid instance.

import { writable, type Readable } from 'svelte/store';
import { Grid } from '@griddle/core';
import type { GridConfig, Tile, GridSnapshot } from '@griddle/core';

export interface UseGriddleInit {
  config: GridConfig;
  tiles?: Tile[];
}

export interface GriddleApi {
  grid: Grid;
  tiles: Readable<Tile[]>;
  config: Readable<GridConfig>;
  version: Readable<number>;
  moveTile: (id: string, target: { col: number; row: number }) => boolean;
  resizeTile: (id: string, size: { w: number; h: number }) => boolean;
  addTile: (t: Tile) => void;
  removeTile: (id: string) => void;
  updateConfig: (patch: Partial<GridConfig>) => void;
  toJSON: () => GridSnapshot;
  loadJSON: (snap: GridSnapshot) => void;
  destroy: () => void;
}

export function createGriddle(init: UseGriddleInit): GriddleApi {
  const grid = new Grid(init.config, init.tiles ?? []);
  const tiles = writable<Tile[]>(grid.tiles);
  const config = writable<GridConfig>(grid.config);
  const version = writable(0);

  const off = grid.changes.on(() => {
    tiles.set(grid.tiles);
    config.set(grid.config);
    version.update((v) => v + 1);
  });

  return {
    grid,
    tiles: { subscribe: tiles.subscribe },
    config: { subscribe: config.subscribe },
    version: { subscribe: version.subscribe },
    moveTile: (id, target) => grid.moveTile(id, target),
    resizeTile: (id, size) => grid.resizeTile(id, size),
    addTile: (t) => grid.addTile(t),
    removeTile: (id) => grid.removeTile(id),
    updateConfig: (patch) => grid.updateConfig(patch),
    toJSON: () => grid.toJSON(),
    loadJSON: (snap) => grid.loadJSON(snap),
    destroy: () => off(),
  };
}
