<template>
  <div :style="panelStyle">
    <h2 style="margin:0 0 4px;font-size:18px">Griddle</h2>
    <p style="margin:0 0 20px;color:#7a8397;font-size:12px">Vue demo</p>

    <div :style="heading">Grid</div>
    <div :style="row"><span :style="label">Columns</span>
      <input :style="inputStyle" type="number" min="1" :value="cfg.cols === Infinity ? '' : cfg.cols"
        :placeholder="cfg.cols === Infinity ? '∞' : ''"
        @input="(e) => setCols((e.target as HTMLInputElement).value)"/>
    </div>
    <div :style="row"><span :style="label">Rows</span>
      <input :style="inputStyle" type="number" min="1" :value="cfg.rows === Infinity ? '' : cfg.rows"
        :placeholder="cfg.rows === Infinity ? '∞' : ''"
        @input="(e) => setRows((e.target as HTMLInputElement).value)"/>
    </div>
    <div :style="row"><span :style="label">Infinite X</span>
      <input type="checkbox" :checked="!!cfg.infiniteX" @change="(e) => api.updateConfig({ cols: (e.target as HTMLInputElement).checked ? Infinity : 12, infiniteX: (e.target as HTMLInputElement).checked })"/>
    </div>
    <div :style="row"><span :style="label">Infinite Y</span>
      <input type="checkbox" :checked="!!cfg.infiniteY" @change="(e) => api.updateConfig({ rows: (e.target as HTMLInputElement).checked ? Infinity : 12, infiniteY: (e.target as HTMLInputElement).checked })"/>
    </div>
    <div :style="row"><span :style="label">Unit width (px)</span>
      <input :style="inputStyle" type="number" min="20" :value="cfg.unitWidth" @input="(e) => api.updateConfig({ unitWidth: Math.max(20, parseInt((e.target as HTMLInputElement).value, 10) || 75) })"/>
    </div>
    <div :style="row"><span :style="label">Unit height (px)</span>
      <input :style="inputStyle" type="number" min="20" :value="cfg.unitHeight" @input="(e) => api.updateConfig({ unitHeight: Math.max(20, parseInt((e.target as HTMLInputElement).value, 10) || 75) })"/>
    </div>
    <div :style="row"><span :style="label">Gap (px)</span>
      <input :style="inputStyle" type="number" min="0" :value="cfg.gap ?? 0" @input="(e) => api.updateConfig({ gap: Math.max(0, parseInt((e.target as HTMLInputElement).value, 10) || 0) })"/>
    </div>
    <div :style="row"><span :style="label">Tile radius (px)</span>
      <input :style="inputStyle" type="number" min="0" :value="cfg.tileRadius ?? 4" @input="(e) => api.updateConfig({ tileRadius: Math.max(0, parseInt((e.target as HTMLInputElement).value, 10) || 0) })"/>
    </div>

    <div :style="heading">Behavior</div>
    <div :style="row"><span :style="label">Gravity</span>
      <select :style="selectStyle" :value="typeof cfg.gravity === 'string' ? cfg.gravity : 'none'" @change="(e) => api.updateConfig({ gravity: (e.target as HTMLSelectElement).value as any })">
        <option value="none">none</option>
        <option value="top">top</option>
        <option value="bottom">bottom</option>
        <option value="left">left</option>
        <option value="right">right</option>
      </select>
    </div>
    <div :style="row"><span :style="label">Snap during drag</span>
      <input type="checkbox" :checked="cfg.snapDuringDrag !== false" @change="(e) => api.updateConfig({ snapDuringDrag: (e.target as HTMLInputElement).checked })"/>
    </div>
    <div :style="row"><span :style="label">Resize handles</span>
      <div style="display:flex;gap:4px">
        <button v-for="c in corners" :key="c" @click="toggleHandle(c)"
          :style="{ width: '28px', height: '28px', padding: '0', border: '1px solid #d0d4db',
            background: handlesSet.has(c) ? '#3b5bdb' : 'white',
            color: handlesSet.has(c) ? 'white' : '#4a5160',
            borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }">{{ c }}</button>
      </div>
    </div>

    <div :style="heading">Positioning</div>
    <div :style="row"><span :style="label">Enable positioning</span>
      <input type="checkbox" :checked="!!cfg.enablePositioning" @change="(e) => api.updateConfig({ enablePositioning: (e.target as HTMLInputElement).checked })"/>
    </div>
    <div :style="row"><span :style="label">Pin units</span>
      <select :style="selectStyle" :disabled="!cfg.enablePositioning" :value="cfg.pinUnits ?? 'pixels'"
        @change="(e) => api.updateConfig({ pinUnits: (e.target as HTMLSelectElement).value as any })">
        <option value="pixels">pixels</option>
        <option value="subcell">subcell</option>
        <option value="cells">cells</option>
      </select>
    </div>
    <div :style="row"><span :style="label">Relative units</span>
      <select :style="selectStyle" :disabled="!cfg.enablePositioning" :value="cfg.relativeUnits ?? 'pixels'"
        @change="(e) => api.updateConfig({ relativeUnits: (e.target as HTMLSelectElement).value as any })">
        <option value="pixels">pixels</option>
        <option value="subcell">subcell</option>
      </select>
    </div>

    <div v-if="cfg.enablePositioning">
      <div :style="row"><span :style="label">Tile</span>
        <select :style="{ ...selectStyle, minWidth: '120px' }" :value="selectedTileId ?? ''" @change="(e) => $emit('selectTile', (e.target as HTMLSelectElement).value)">
          <option value="">(pick a tile)</option>
          <option v-for="t in tiles" :key="t.id" :value="t.id">{{ t.id }} ({{ t.position ?? 'static' }})</option>
        </select>
      </div>
      <template v-if="selectedTile">
        <div :style="row"><span :style="label">Position</span>
          <select :style="selectStyle" :value="selectedTile.position ?? 'static'" @change="(e) => onChangePosition((e.target as HTMLSelectElement).value as any)">
            <option value="static">static</option>
            <option value="relative">relative</option>
            <option value="absolute">absolute</option>
            <option value="fixed">fixed</option>
            <option value="sticky">sticky</option>
          </select>
        </div>
        <template v-if="selectedTile.position === 'absolute' || selectedTile.position === 'fixed'">
          <div :style="row"><span :style="label">Pinned X ({{ pinUnitsLabel }})</span>
            <input :style="inputStyle" type="number" :step="cfg.pinUnits === 'subcell' ? 0.1 : 1" :value="selectedTile.pinned?.x ?? 0"
              @input="(e) => onChangePinned('x', parseFloat((e.target as HTMLInputElement).value))"/>
          </div>
          <div :style="row"><span :style="label">Pinned Y ({{ pinUnitsLabel }})</span>
            <input :style="inputStyle" type="number" :step="cfg.pinUnits === 'subcell' ? 0.1 : 1" :value="selectedTile.pinned?.y ?? 0"
              @input="(e) => onChangePinned('y', parseFloat((e.target as HTMLInputElement).value))"/>
          </div>
        </template>
        <template v-if="selectedTile.position === 'relative'">
          <div :style="row"><span :style="label">Offset X ({{ relUnitsLabel }})</span>
            <input :style="inputStyle" type="number" :step="cfg.relativeUnits === 'subcell' ? 0.1 : 1" :value="selectedTile.offset?.x ?? 0"
              @input="(e) => onChangeOffset('x', parseFloat((e.target as HTMLInputElement).value))"/>
          </div>
          <div :style="row"><span :style="label">Offset Y ({{ relUnitsLabel }})</span>
            <input :style="inputStyle" type="number" :step="cfg.relativeUnits === 'subcell' ? 0.1 : 1" :value="selectedTile.offset?.y ?? 0"
              @input="(e) => onChangeOffset('y', parseFloat((e.target as HTMLInputElement).value))"/>
          </div>
        </template>
        <template v-if="selectedTile.position === 'sticky'">
          <div :style="row"><span :style="label">Edge</span>
            <select :style="selectStyle" :value="selectedTile.sticky?.edge ?? 'top'" @change="(e) => onChangeStickyEdge((e.target as HTMLSelectElement).value as any)">
              <option value="top">top</option>
              <option value="bottom">bottom</option>
              <option value="left">left</option>
              <option value="right">right</option>
            </select>
          </div>
          <div :style="row"><span :style="label">Threshold (px)</span>
            <input :style="inputStyle" type="number" min="0" :value="selectedTile.sticky?.threshold ?? 0"
              @input="(e) => onChangeStickyThreshold(parseFloat((e.target as HTMLInputElement).value))"/>
          </div>
        </template>
      </template>
    </div>

    <div :style="heading">Add tile</div>
    <div :style="row"><span :style="label">Size</span>
      <div style="display:flex;align-items:center;gap:4px">
        <input :style="{ ...inputStyle, width: '50px' }" type="number" min="1" max="6" v-model.number="addW"/>
        <span style="color:#7a8397">×</span>
        <input :style="{ ...inputStyle, width: '50px' }" type="number" min="1" max="6" v-model.number="addH"/>
      </div>
    </div>

    <div :style="heading">Placement</div>
    <div :style="row"><span :style="label">Strategy</span>
      <select :style="selectStyle" v-model="placementStrategy">
        <option value="nearest">nearest</option>
        <option value="adjacent">adjacent</option>
        <option value="append">append</option>
      </select>
    </div>
    <div :style="row"><span :style="label">Gravity-aware</span>
      <input type="checkbox" v-model="gravityAware"/>
    </div>
    <div v-if="placementStrategy === 'adjacent'" :style="row"><span :style="label">Reference tile</span>
      <select :style="{ ...selectStyle, minWidth: '120px' }" v-model="refTileId">
        <option value="">(none)</option>
        <option v-for="t in tiles" :key="t.id" :value="t.id">{{ t.id }}</option>
      </select>
    </div>
    <button :style="buttonPrimary" @click="$emit('add', addW, addH, placementStrategy, { gravityAware, relativeTo: refTileId || undefined })">
      Add {{ addW }}×{{ addH }} tile ({{ placementStrategy }})
    </button>

    <div :style="heading">JSON</div>
    <textarea v-model="jsonText" :style="textareaStyle" placeholder="Click Export to populate…"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button :style="buttonSecondary" @click="exportJson">Export</button>
      <button :style="buttonSecondary" @click="importJson">Import</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GriddleApi } from '@griddle/vue';
import type { Corner, PlacementStrategy, StickyEdge, TilePosition } from '@griddle/core';

const props = defineProps<{ api: GriddleApi; selectedTileId?: string }>();
defineEmits<{
  (e: 'add', w: number, h: number, strategy: PlacementStrategy, opts: { gravityAware?: boolean; relativeTo?: string }): void;
  (e: 'selectTile', id: string): void;
}>();

const cfg = computed(() => props.api.config.value);
const tiles = computed(() => props.api.tiles.value);
const selectedTile = computed(() =>
  props.selectedTileId ? tiles.value.find((t) => t.id === props.selectedTileId) ?? null : null,
);
const pinUnitsLabel = computed(() => cfg.value.pinUnits ?? 'pixels');
const relUnitsLabel = computed(() => cfg.value.relativeUnits ?? 'pixels');
const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
const handlesSet = computed(() => new Set<Corner>(cfg.value.resizeHandles ?? []));
const addW = ref(1);
const addH = ref(1);
const placementStrategy = ref<PlacementStrategy>('nearest');
const gravityAware = ref(false);
const refTileId = ref('');

const gravityIsActive = computed(() => {
  const g = cfg.value.gravity;
  return typeof g === 'string' && g !== 'none';
});
watch(gravityIsActive, (active) => { gravityAware.value = active; }, { immediate: true });
const jsonText = ref('');

function toggleHandle(c: Corner) {
  const next = new Set(handlesSet.value);
  if (next.has(c)) next.delete(c); else next.add(c);
  props.api.updateConfig({ resizeHandles: Array.from(next) });
}
function setCols(v: string) {
  const n = v === '' ? Infinity : Math.max(1, parseInt(v, 10));
  props.api.updateConfig({ cols: n, infiniteX: n === Infinity });
}
function setRows(v: string) {
  const n = v === '' ? Infinity : Math.max(1, parseInt(v, 10));
  props.api.updateConfig({ rows: n, infiniteY: n === Infinity });
}
function exportJson() {
  jsonText.value = JSON.stringify(props.api.toJSON(), null, 2);
}
function importJson() {
  try {
    props.api.loadJSON(JSON.parse(jsonText.value));
  } catch (e) { alert('Invalid JSON: ' + (e as Error).message); }
}

function onChangePosition(p: TilePosition) {
  if (!selectedTile.value) return;
  const t = selectedTile.value;
  const opts: Parameters<typeof props.api.grid.setTilePosition>[2] = {};
  if ((p === 'absolute' || p === 'fixed') && !t.pinned) {
    const colSize = cfg.value.unitWidth + (cfg.value.gap ?? 0);
    const rowSize = cfg.value.unitHeight + (cfg.value.gap ?? 0);
    const pxX = t.col * colSize;
    const pxY = t.row * rowSize;
    const units = cfg.value.pinUnits ?? 'pixels';
    if (units === 'pixels') opts.pinned = { x: pxX, y: pxY };
    else if (units === 'subcell') opts.pinned = { x: pxX / colSize, y: pxY / rowSize };
    else opts.pinned = { x: t.col, y: t.row };
  }
  if (p === 'relative' && !t.offset) opts.offset = { x: 0, y: 0 };
  if (p === 'sticky' && !t.sticky) opts.sticky = { edge: 'top', threshold: 0 };
  props.api.grid.setTilePosition(t.id, p, opts);
}
function onChangePinned(axis: 'x' | 'y', v: number) {
  if (!selectedTile.value) return;
  const cur = selectedTile.value.pinned ?? { x: 0, y: 0 };
  const next = { ...cur, [axis]: isNaN(v) ? 0 : v };
  props.api.grid.setTilePinned(selectedTile.value.id, next);
}
function onChangeOffset(axis: 'x' | 'y', v: number) {
  if (!selectedTile.value) return;
  const t = selectedTile.value;
  const cur = t.offset ?? { x: 0, y: 0 };
  const next = { ...cur, [axis]: isNaN(v) ? 0 : v };
  props.api.grid.setTilePosition(t.id, 'relative', { offset: next });
}
function onChangeStickyEdge(edge: StickyEdge) {
  if (!selectedTile.value) return;
  const t = selectedTile.value;
  const cur = t.sticky ?? { edge: 'top' as StickyEdge, threshold: 0 };
  props.api.grid.setTilePosition(t.id, 'sticky', { sticky: { ...cur, edge } });
}
function onChangeStickyThreshold(v: number) {
  if (!selectedTile.value) return;
  const t = selectedTile.value;
  const cur = t.sticky ?? { edge: 'top' as StickyEdge, threshold: 0 };
  props.api.grid.setTilePosition(t.id, 'sticky', { sticky: { ...cur, threshold: isNaN(v) ? 0 : v } });
}

const panelStyle = { width: '320px', background: 'white', borderRight: '1px solid #e4e6eb', padding: '20px 20px 40px', overflowY: 'auto' as const, fontSize: '13px' };
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0', gap: '8px' };
const label = { color: '#4a5160', flex: 1 };
const inputStyle = { width: '80px', padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: '4px', fontSize: '13px' };
const selectStyle = { padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: '4px', fontSize: '13px', background: 'white' };
const buttonPrimary = { width: '100%', padding: '8px 10px', border: '1px solid #3b5bdb', background: '#3b5bdb', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' };
const buttonSecondary = { ...buttonPrimary, background: 'white', color: '#3b5bdb' };
const heading = { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#7a8397', margin: '20px 0 8px' };
const textareaStyle = { width: '100%', height: '160px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px', padding: '8px', border: '1px solid #d0d4db', borderRadius: '4px' };
</script>
