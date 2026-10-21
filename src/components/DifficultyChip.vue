<script setup lang="ts">
import { computed } from 'vue'
import { puzzleDifficultyMeta, type PuzzleDifficulty } from '../engine/puzzles'

const props = withDefaults(
  defineProps<{
    difficulty: PuzzleDifficulty
    compact?: boolean
  }>(),
  { compact: false }
)

const meta = computed(() => puzzleDifficultyMeta(props.difficulty))
</script>

<template>
  <span
    class="difficulty-chip"
    :class="{ 'difficulty-chip--compact': compact }"
    :style="{ '--difficulty-accent': meta.accent }"
    :title="meta.blurb"
    :data-difficulty="difficulty"
  >
    <span class="difficulty-chip__dot" aria-hidden="true"></span>{{ meta.label }}
  </span>
</template>

<style scoped>
.difficulty-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  line-height: 1.4;
  color: var(--difficulty-accent);
  background: color-mix(in srgb, var(--difficulty-accent) 10%, #0b0912);
  border: 1px solid color-mix(in srgb, var(--difficulty-accent) 55%, transparent);
  white-space: nowrap;
}

.difficulty-chip--compact {
  padding: 2px 6px;
  font-size: 0.46rem;
  letter-spacing: 0.08em;
}

.difficulty-chip__dot {
  width: 6px;
  height: 6px;
  background: var(--difficulty-accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--difficulty-accent) 70%, transparent);
}
</style>
