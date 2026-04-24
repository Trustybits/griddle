<template>
  <div :style="containerStyle">
    <span>{{ tile.id }}</span>
    <span :style="sizeLabelStyle">{{ tile.w }}×{{ tile.h }}</span>
    <button
      @pointerdown.stop
      @click="$emit('remove', tile.id)"
      :style="buttonStyle"
      :aria-label="`Remove tile ${tile.id}`"
    >×</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Tile } from '@griddle/core';
import { colorForSize } from './palette.js';

const props = defineProps<{ tile: Tile }>();
defineEmits<{ (e: 'remove', id: string): void }>();

const containerStyle = computed(() => ({
  width: '100%',
  height: '100%',
  background: colorForSize(props.tile.w, props.tile.h),
  color: 'white',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: '600',
  fontSize: Math.max(14, Math.min(props.tile.w, props.tile.h) * 10) + 'px',
  position: 'relative' as const,
  userSelect: 'none' as const,
}));
const sizeLabelStyle = { position: 'absolute' as const, top: '6px', left: '8px', fontSize: '11px', opacity: 0.75 };
const buttonStyle = {
  position: 'absolute' as const, top: '4px', right: '4px',
  width: '22px', height: '22px', border: 'none', borderRadius: '11px',
  background: 'rgba(0,0,0,0.25)', color: 'white', cursor: 'pointer',
  fontSize: '14px', lineHeight: '22px', padding: '0',
};
</script>
