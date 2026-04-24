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

    <div :style="heading">Add tile</div>
    <div :style="row"><span :style="label">Size</span>
      <div style="display:flex;align-items:center;gap:4px">
        <input :style="{ ...inputStyle, width: '50px' }" type="number" min="1" max="6" v-model.number="addW"/>
        <span style="color:#7a8397">×</span>
        <input :style="{ ...inputStyle, width: '50px' }" type="number" min="1" max="6" v-model.number="addH"/>
      </div>
    </div>
    <button :style="buttonPrimary" @click="$emit('add', addW, addH)">Add {{ addW }}×{{ addH }} tile</button>

    <div :style="heading">JSON</div>
    <textarea v-model="jsonText" :style="textareaStyle" placeholder="Click Export to populate…"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button :style="buttonSecondary" @click="exportJson">Export</button>
      <button :style="buttonSecondary" @click="importJson">Import</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GriddleApi } from '@griddle/vue';
import type { Corner } from '@griddle/core';

const props = defineProps<{ api: GriddleApi }>();
defineEmits<{ (e: 'add', w: number, h: number): void }>();

const cfg = computed(() => props.api.config.value);
const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
const handlesSet = computed(() => new Set<Corner>(cfg.value.resizeHandles ?? []));
const addW = ref(1);
const addH = ref(1);
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

const panelStyle = { width: '300px', background: 'white', borderRight: '1px solid #e4e6eb', padding: '20px 20px 40px', overflowY: 'auto' as const, fontSize: '13px' };
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' };
const label = { color: '#4a5160', flex: 1 };
const inputStyle = { width: '80px', padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: '4px', fontSize: '13px' };
const selectStyle = { padding: '4px 6px', border: '1px solid #d0d4db', borderRadius: '4px', fontSize: '13px', background: 'white' };
const buttonPrimary = { width: '100%', padding: '8px 10px', border: '1px solid #3b5bdb', background: '#3b5bdb', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' };
const buttonSecondary = { ...buttonPrimary, background: 'white', color: '#3b5bdb' };
const heading = { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#7a8397', margin: '20px 0 8px' };
const textareaStyle = { width: '100%', height: '160px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px', padding: '8px', border: '1px solid #d0d4db', borderRadius: '4px' };
</script>
