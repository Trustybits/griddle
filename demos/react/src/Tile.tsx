import { CSSProperties } from 'react';
import type { Tile } from '@griddle/core';
import { colorForSize } from './palette.js';

export function DemoTile(props: { tile: Tile; onRemove: (id: string) => void }) {
  const { tile, onRemove } = props;
  const color = colorForSize(tile.w, tile.h);
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    background: color,
    color: 'white',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: Math.max(14, Math.min(tile.w, tile.h) * 10),
    position: 'relative',
    userSelect: 'none',
  };
  return (
    <div style={style}>
      <span>{tile.id}</span>
      <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 11, opacity: 0.75 }}>
        {tile.w}×{tile.h}
      </span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(tile.id)}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          border: 'none',
          borderRadius: 11,
          background: 'rgba(0,0,0,0.25)',
          color: 'white',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: '22px',
          padding: 0,
        }}
        aria-label={`Remove tile ${tile.id}`}
      >
        ×
      </button>
    </div>
  );
}
