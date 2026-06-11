import { useRef } from 'react';
import { GriddleGrid, useGriddle } from '@griddle/react';
import type { Tile, PlacementStrategy } from '@griddle/core';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAdd = (w: number, h: number, strategy: string, opts: { gravityAware?: boolean; relativeTo?: string }) => {
    const id = String(nextIdRef.current++);

    const scrollEl = scrollRef.current?.firstElementChild as HTMLDivElement | null;
    let anchor: { col: number; row: number } | undefined;
    if (scrollEl) {
      const cfg = api.config;
      const colSize = cfg.unitWidth + (cfg.gap ?? 0);
      const rowSize = cfg.unitHeight + (cfg.gap ?? 0);
      const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
      const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
      anchor = {
        col: Math.floor(centerX / colSize),
        row: Math.floor(centerY / rowSize),
      };
    }

    const result = api.grid.addTileAtBestPosition(
      { id, col: 0, row: 0, w, h },
      {
        strategy: strategy as PlacementStrategy,
        anchor,
        gravityAware: opts.gravityAware,
        relativeTo: opts.relativeTo,
      },
    );

    if (result && scrollEl) {
      const cfg = api.config;
      const colSize = cfg.unitWidth + (cfg.gap ?? 0);
      const rowSize = cfg.unitHeight + (cfg.gap ?? 0);
      const tileX = result.position.col * colSize;
      const tileY = result.position.row * rowSize;
      const isVisible = (
        tileX >= scrollEl.scrollLeft &&
        tileX < scrollEl.scrollLeft + scrollEl.clientWidth &&
        tileY >= scrollEl.scrollTop &&
        tileY < scrollEl.scrollTop + scrollEl.clientHeight
      );
      if (!isVisible) {
        scrollEl.scrollTo({
          left: tileX - scrollEl.clientWidth / 2 + (w * colSize) / 2,
          top: tileY - scrollEl.clientHeight / 2 + (h * rowSize) / 2,
          behavior: 'smooth',
        });
      }
    }
  };

  const handleRemove = (id: string) => api.removeTile(id);

  const handleDrawCreate = (rect: { col: number; row: number; w: number; h: number }) => {
    const id = String(nextIdRef.current++);
    api.grid.addTileWithDisplacement({ id, ...rect });
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ConfigPanel api={api} onAddTile={handleAdd} nextId={() => String(nextIdRef.current++)} />
      <div ref={scrollRef} style={{ flex: 1, background: '#eef1f5', position: 'relative' }}>
        <GriddleGrid
          api={api}
          renderTile={(t, _selected) => <DemoTile tile={t} onRemove={handleRemove} />}
          onDrawCreate={handleDrawCreate}
        />
      </div>
    </div>
  );
}
