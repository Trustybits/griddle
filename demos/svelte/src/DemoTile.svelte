<script lang="ts">
  import type { Tile } from '@griddle/core';
  import { colorForSize } from './palette.js';
  import { createEventDispatcher } from 'svelte';

  export let tile: Tile;
  const dispatch = createEventDispatcher<{ remove: string }>();

  $: color = colorForSize(tile.w, tile.h);
  $: fontSize = Math.max(14, Math.min(tile.w, tile.h) * 10);
</script>

<div
  class="demo-tile"
  style:background={color}
  style:font-size={fontSize + 'px'}
>
  <span>{tile.id}</span>
  <span class="size">{tile.w}×{tile.h}</span>
  <button
    class="close"
    on:pointerdown|stopPropagation
    on:click={() => dispatch('remove', tile.id)}
    aria-label={`Remove tile ${tile.id}`}
  >×</button>
</div>

<style>
  .demo-tile {
    width: 100%;
    height: 100%;
    color: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    position: relative;
    user-select: none;
  }
  .size { position: absolute; top: 6px; left: 8px; font-size: 11px; opacity: 0.75; }
  .close {
    position: absolute; top: 4px; right: 4px;
    width: 22px; height: 22px; border: none; border-radius: 11px;
    background: rgba(0,0,0,0.25); color: white; cursor: pointer;
    font-size: 14px; line-height: 22px; padding: 0;
  }
</style>
