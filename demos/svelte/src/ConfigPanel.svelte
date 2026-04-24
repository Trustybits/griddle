<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { GriddleApi } from '@griddle/svelte';
  import type { Corner } from '@griddle/core';

  export let api: GriddleApi;
  const dispatch = createEventDispatcher<{ add: { w: number; h: number } }>();

  const cfgStore = api.config;
  $: cfg = $cfgStore;

  const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
  $: handlesSet = new Set<Corner>(cfg.resizeHandles ?? []);

  let addW = 1;
  let addH = 1;
  let jsonText = '';

  function toggleHandle(c: Corner) {
    const next = new Set(handlesSet);
    if (next.has(c)) next.delete(c); else next.add(c);
    api.updateConfig({ resizeHandles: Array.from(next) });
  }
  function setColsFromEvent(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const v = el.value;
    const n = v === '' ? Infinity : Math.max(1, parseInt(v, 10));
    api.updateConfig({ cols: n, infiniteX: n === Infinity });
  }
  function setRowsFromEvent(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const v = el.value;
    const n = v === '' ? Infinity : Math.max(1, parseInt(v, 10));
    api.updateConfig({ rows: n, infiniteY: n === Infinity });
  }
  function setInfiniteX(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ cols: el.checked ? Infinity : 12, infiniteX: el.checked });
  }
  function setInfiniteY(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ rows: el.checked ? Infinity : 12, infiniteY: el.checked });
  }
  function setUnitWidth(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ unitWidth: Math.max(20, parseInt(el.value, 10) || 75) });
  }
  function setUnitHeight(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ unitHeight: Math.max(20, parseInt(el.value, 10) || 75) });
  }
  function setGap(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ gap: Math.max(0, parseInt(el.value, 10) || 0) });
  }
  function setGravity(e: Event) {
    const el = e.currentTarget as HTMLSelectElement;
    api.updateConfig({ gravity: el.value as any });
  }
  function setSnap(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    api.updateConfig({ snapDuringDrag: el.checked });
  }
  function exportJson() {
    jsonText = JSON.stringify(api.toJSON(), null, 2);
  }
  function importJson() {
    try { api.loadJSON(JSON.parse(jsonText)); }
    catch (e) { alert('Invalid JSON: ' + (e as Error).message); }
  }
</script>

<div class="panel">
  <h2>Griddle</h2>
  <p>Svelte demo</p>

  <div class="h">Grid</div>
  <div class="row"><span>Columns</span>
    <input type="number" min="1" value={cfg.cols === Infinity ? '' : cfg.cols}
      placeholder={cfg.cols === Infinity ? '∞' : ''}
      on:input={setColsFromEvent}/>
  </div>
  <div class="row"><span>Rows</span>
    <input type="number" min="1" value={cfg.rows === Infinity ? '' : cfg.rows}
      placeholder={cfg.rows === Infinity ? '∞' : ''}
      on:input={setRowsFromEvent}/>
  </div>
  <div class="row"><span>Infinite X</span>
    <input type="checkbox" checked={!!cfg.infiniteX} on:change={setInfiniteX}/>
  </div>
  <div class="row"><span>Infinite Y</span>
    <input type="checkbox" checked={!!cfg.infiniteY} on:change={setInfiniteY}/>
  </div>
  <div class="row"><span>Unit width (px)</span>
    <input type="number" min="20" value={cfg.unitWidth} on:input={setUnitWidth}/>
  </div>
  <div class="row"><span>Unit height (px)</span>
    <input type="number" min="20" value={cfg.unitHeight} on:input={setUnitHeight}/>
  </div>
  <div class="row"><span>Gap (px)</span>
    <input type="number" min="0" value={cfg.gap ?? 0} on:input={setGap}/>
  </div>

  <div class="h">Behavior</div>
  <div class="row"><span>Gravity</span>
    <select value={typeof cfg.gravity === 'string' ? cfg.gravity : 'none'} on:change={setGravity}>
      <option value="none">none</option>
      <option value="top">top</option>
      <option value="bottom">bottom</option>
      <option value="left">left</option>
      <option value="right">right</option>
    </select>
  </div>
  <div class="row"><span>Snap during drag</span>
    <input type="checkbox" checked={cfg.snapDuringDrag !== false} on:change={setSnap}/>
  </div>
  <div class="row"><span>Resize handles</span>
    <div class="handleRow">
      {#each corners as c}
        <button class="handleBtn" class:active={handlesSet.has(c)} on:click={() => toggleHandle(c)}>{c}</button>
      {/each}
    </div>
  </div>

  <div class="h">Add tile</div>
  <div class="row"><span>Size</span>
    <div style="display:flex;align-items:center;gap:4px">
      <input class="small" type="number" min="1" max="6" bind:value={addW}/>
      <span style="color:#7a8397">×</span>
      <input class="small" type="number" min="1" max="6" bind:value={addH}/>
    </div>
  </div>
  <button class="primary" on:click={() => dispatch('add', { w: addW, h: addH })}>Add {addW}×{addH} tile</button>

  <div class="h">JSON</div>
  <textarea bind:value={jsonText} placeholder="Click Export to populate…"></textarea>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="secondary" on:click={exportJson}>Export</button>
    <button class="secondary" on:click={importJson}>Import</button>
  </div>
</div>

<style>
  .panel { width: 300px; background: white; border-right: 1px solid #e4e6eb; padding: 20px 20px 40px; overflow-y: auto; font-size: 13px; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  p { margin: 0 0 20px; color: #7a8397; font-size: 12px; }
  .h { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #7a8397; margin: 20px 0 8px; }
  .row { display: flex; align-items: center; justify-content: space-between; margin: 10px 0; }
  .row > span { color: #4a5160; flex: 1; }
  input[type="number"] { width: 80px; padding: 4px 6px; border: 1px solid #d0d4db; border-radius: 4px; font-size: 13px; }
  input.small { width: 50px; }
  select { padding: 4px 6px; border: 1px solid #d0d4db; border-radius: 4px; font-size: 13px; background: white; }
  textarea { width: 100%; height: 160px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; padding: 8px; border: 1px solid #d0d4db; border-radius: 4px; }
  .handleRow { display: flex; gap: 4px; }
  .handleBtn { width: 28px; height: 28px; padding: 0; border: 1px solid #d0d4db; background: white; color: #4a5160; border-radius: 4px; cursor: pointer; font-size: 11px; }
  .handleBtn.active { background: #3b5bdb; color: white; border-color: #3b5bdb; }
  button.primary { width: 100%; padding: 8px 10px; border: 1px solid #3b5bdb; background: #3b5bdb; color: white; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
  button.secondary { flex: 1; padding: 8px 10px; border: 1px solid #3b5bdb; background: white; color: #3b5bdb; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
</style>
