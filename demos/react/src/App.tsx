import { useRef } from 'react';
import { GriddleGrid, useGriddle } from '@griddle/react';
import type { Tile } from '@griddle/core';
import { ConfigPanel } from './ConfigPanel.js';
import { DemoTile } from './Tile.js';

export function App() {
  const api = useGriddle(() => ({
    config: {
      cols: 12,
      rows: 12,
      unitWidth: 75,
      unitHeight: 75,
      gap: 4,
      gravity: 'none',
      resizeHandles: ['se'],
      snapDuringDrag: true,
    },
    tiles: [
      { id: '1', col: 0, row: 0, w: 2, h: 2 },
      { id: '2', col: 2, row: 0, w: 1, h: 1 },
      { id: '3', col: 3, row: 0, w: 3, h: 1 },
      { id: '4', col: 6, row: 0, w: 1, h: 2 },
      { id: '5', col: 7, row: 0, w: 2, h: 2 },
      { id: '6', col: 0, row: 2, w: 1, h: 1 },
      { id: '7', col: 1, row: 2, w: 1, h: 1 },
      { id: '8', col: 9, row: 0, w: 1, h: 1 },
      { id: '9', col: 10, row: 0, w: 1, h: 1 },
      { id: '10', col: 2, row: 1, w: 2, h: 1 },
    ] satisfies Tile[],
  }));

  const nextIdRef = useRef(11);
  const handleAdd = (w: number, h: number) => {
    // Find first empty spot (naive scan) within bounds
    const cfg = api.config;
    const maxCol = cfg.cols === Infinity ? 20 : cfg.cols;
    const maxRow = cfg.rows === Infinity ? 40 : cfg.rows;
    outer: for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c + w <= maxCol; c++) {
        const hits = api.grid.tilesIn({ col: c, row: r, w, h });
        if (hits.length === 0 && api.grid.rectInBounds({ col: c, row: r, w, h })) {
          const id = String(nextIdRef.current++);
          api.addTile({ id, col: c, row: r, w, h });
          return;
        }
      }
      if (r > maxRow) break outer;
    }
    // No spot found: place at (0,0) and let the movement/repack do its thing
    const id = String(nextIdRef.current++);
    api.addTile({ id, col: 0, row: 0, w, h });
  };

  const handleRemove = (id: string) => api.removeTile(id);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ConfigPanel api={api} onAddTile={handleAdd} nextId={() => String(nextIdRef.current++)} />
      <div style={{ flex: 1, background: '#eef1f5', position: 'relative' }}>
        <GriddleGrid
          api={api}
          renderTile={(t) => <DemoTile tile={t} onRemove={handleRemove} />}
        />
      </div>
    </div>
  );
}
