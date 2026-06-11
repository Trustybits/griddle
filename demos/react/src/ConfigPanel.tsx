import { CSSProperties, useState } from 'react';
import type { GriddleApi } from '@griddle/react';
import type { Corner, Gravity } from '@griddle/core';

const panelStyle: CSSProperties = {
  width: 300,
  background: 'white',
  borderRight: '1px solid #e4e6eb',
  padding: '20px 20px 40px',
  overflowY: 'auto',
  fontSize: 13,
};

const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' };
const label: CSSProperties = { color: '#4a5160', flex: 1 };
const input: CSSProperties = { width: 80, padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: 4, fontSize: 13 };
const select: CSSProperties = { padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: 4, fontSize: 13, background: 'white' };
const button: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #3b5bdb',
  background: '#3b5bdb',
  color: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};
const secondaryBtn: CSSProperties = { ...button, background: 'white', color: '#3b5bdb' };
const heading: CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#7a8397', margin: '20px 0 8px' };

const CORNER_ORDER: Corner[] = ['nw', 'ne', 'sw', 'se'];

export function ConfigPanel(props: {
  api: GriddleApi;
  onAddTile: (w: number, h: number) => void;
  nextId: () => string;
}) {
  const { api, onAddTile } = props;
  const cfg = api.config;
  const [addW, setAddW] = useState(1);
  const [addH, setAddH] = useState(1);
  const [jsonText, setJsonText] = useState('');

  const handles = new Set<Corner>(cfg.resizeHandles ?? []);
  const toggleHandle = (c: Corner) => {
    const next = new Set(handles);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    api.updateConfig({ resizeHandles: Array.from(next) });
  };

  const gravityVal: string =
    typeof cfg.gravity === 'string' ? cfg.gravity : 'anchor';

  const setGravity = (v: string) => {
    if (v === 'anchor') api.updateConfig({ gravity: { col: 0, row: 0 } });
    else api.updateConfig({ gravity: v as Gravity });
  };

  const exportJson = () => {
    const snap = api.toJSON();
    setJsonText(JSON.stringify(snap, null, 2));
  };
  const importJson = () => {
    try {
      const snap = JSON.parse(jsonText);
      api.loadJSON(snap);
    } catch (e) {
      alert('Invalid JSON: ' + (e as Error).message);
    }
  };

  return (
    <div style={panelStyle}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Griddle</h2>
      <p style={{ margin: '0 0 20px', color: '#7a8397', fontSize: 12 }}>
        React demo
      </p>

      <div style={heading}>Grid</div>
      <div style={row}>
        <span style={label}>Columns</span>
        <input style={input} type="number" min={1} value={cfg.cols === Infinity ? '' : cfg.cols}
          placeholder={cfg.cols === Infinity ? '∞' : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? Infinity : Math.max(1, parseInt(e.target.value, 10));
            api.updateConfig({ cols: v, infiniteX: v === Infinity });
          }} />
      </div>
      <div style={row}>
        <span style={label}>Rows</span>
        <input style={input} type="number" min={1} value={cfg.rows === Infinity ? '' : cfg.rows}
          placeholder={cfg.rows === Infinity ? '∞' : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? Infinity : Math.max(1, parseInt(e.target.value, 10));
            api.updateConfig({ rows: v, infiniteY: v === Infinity });
          }} />
      </div>
      <div style={row}>
        <span style={label}>Infinite X</span>
        <input type="checkbox" checked={!!cfg.infiniteX} onChange={(e) => api.updateConfig({ cols: e.target.checked ? Infinity : 12, infiniteX: e.target.checked })} />
      </div>
      <div style={row}>
        <span style={label}>Infinite Y</span>
        <input type="checkbox" checked={!!cfg.infiniteY} onChange={(e) => api.updateConfig({ rows: e.target.checked ? Infinity : 12, infiniteY: e.target.checked })} />
      </div>
      <div style={row}>
        <span style={label}>Unit width (px)</span>
        <input style={input} type="number" min={20} value={cfg.unitWidth} onChange={(e) => api.updateConfig({ unitWidth: Math.max(20, parseInt(e.target.value, 10) || 75) })} />
      </div>
      <div style={row}>
        <span style={label}>Unit height (px)</span>
        <input style={input} type="number" min={20} value={cfg.unitHeight} onChange={(e) => api.updateConfig({ unitHeight: Math.max(20, parseInt(e.target.value, 10) || 75) })} />
      </div>
      <div style={row}>
        <span style={label}>Gap (px)</span>
        <input style={input} type="number" min={0} value={cfg.gap ?? 0} onChange={(e) => api.updateConfig({ gap: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
      </div>

      <div style={heading}>Behavior</div>
      <div style={row}>
        <span style={label}>Gravity</span>
        <select style={select} value={gravityVal} onChange={(e) => setGravity(e.target.value)}>
          <option value="none">none</option>
          <option value="top">top</option>
          <option value="bottom">bottom</option>
          <option value="left">left</option>
          <option value="right">right</option>
        </select>
      </div>
      <div style={row}>
        <span style={label}>Snap during drag</span>
        <input type="checkbox" checked={cfg.snapDuringDrag !== false} onChange={(e) => api.updateConfig({ snapDuringDrag: e.target.checked })} />
      </div>
      <div style={row}>
        <span style={label}>Resize handles</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {CORNER_ORDER.map((c) => (
            <button key={c}
              onClick={() => toggleHandle(c)}
              style={{
                width: 28, height: 28, padding: 0, border: '1px solid #d0d4db',
                background: handles.has(c) ? '#3b5bdb' : 'white',
                color: handles.has(c) ? 'white' : '#4a5160',
                borderRadius: 4, cursor: 'pointer', fontSize: 11,
              }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={heading}>Loop</div>
      <div style={row}>
        <span style={label}>Loop (infinite repeat)</span>
        <input
          type="checkbox"
          checked={cfg.loop?.enabled === true}
          onChange={(e) => {
            if (e.target.checked) {
              api.updateConfig({
                // Loop requires a finite period on both axes.
                cols: cfg.cols === Infinity ? 12 : cfg.cols,
                rows: cfg.rows === Infinity ? 12 : cfg.rows,
                infiniteX: false,
                infiniteY: false,
                loop: { ...cfg.loop, enabled: true },
              });
            } else {
              api.updateConfig({ loop: { ...cfg.loop, enabled: false } });
            }
          }}
        />
      </div>
      {cfg.loop?.enabled && (
        <>
          <div style={row}>
            <span style={label}>Interaction</span>
            <select
              style={select}
              value={cfg.loop?.interaction ?? 'pan'}
              onChange={(e) =>
                api.updateConfig({
                  loop: { ...cfg.loop, enabled: true, interaction: e.target.value as 'pan' | 'edit' },
                })
              }
            >
              <option value="pan">pan (viewer)</option>
              <option value="edit">edit (owner)</option>
            </select>
          </div>
          <div style={row}>
            <span style={label}>Friction (1/s)</span>
            <input
              style={input}
              type="number"
              min={0.5}
              step={0.5}
              value={cfg.loop?.physics?.friction ?? 4}
              onChange={(e) =>
                api.updateConfig({
                  loop: {
                    ...cfg.loop,
                    enabled: true,
                    physics: { ...cfg.loop?.physics, friction: parseFloat(e.target.value) || 4 },
                  },
                })
              }
            />
          </div>
          <div style={row}>
            <span style={label}>Ease (1/s)</span>
            <input
              style={input}
              type="number"
              min={1}
              step={1}
              value={cfg.loop?.physics?.ease ?? 12}
              onChange={(e) =>
                api.updateConfig({
                  loop: {
                    ...cfg.loop,
                    enabled: true,
                    physics: { ...cfg.loop?.physics, ease: parseFloat(e.target.value) || 12 },
                  },
                })
              }
            />
          </div>
          <div style={row}>
            <span style={label}>Max velocity (px/s)</span>
            <input
              style={input}
              type="number"
              min={100}
              step={500}
              value={cfg.loop?.physics?.maxVelocity ?? 6000}
              onChange={(e) =>
                api.updateConfig({
                  loop: {
                    ...cfg.loop,
                    enabled: true,
                    physics: { ...cfg.loop?.physics, maxVelocity: parseFloat(e.target.value) || 6000 },
                  },
                })
              }
            />
          </div>
        </>
      )}

      <div style={heading}>Add tile</div>
      <div style={row}>
        <span style={label}>Size</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input style={{ ...input, width: 50 }} type="number" min={1} max={6} value={addW} onChange={(e) => setAddW(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />
          <span style={{ color: '#7a8397' }}>×</span>
          <input style={{ ...input, width: 50 }} type="number" min={1} max={6} value={addH} onChange={(e) => setAddH(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />
        </div>
      </div>
      <button style={button} onClick={() => onAddTile(addW, addH)}>
        Add {addW}×{addH} tile
      </button>

      <div style={heading}>JSON</div>
      <textarea
        style={{ width: '100%', height: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, padding: 8, border: '1px solid #d0d4db', borderRadius: 4 }}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="Click Export to populate…"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={secondaryBtn} onClick={exportJson}>Export</button>
        <button style={secondaryBtn} onClick={importJson}>Import</button>
      </div>
    </div>
  );
}
