<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ExprNode } from '../engine/types'
import CardGroupNode from './CardGroupNode.vue'

const props = defineProps<{
  node: ExprNode
}>()

const frameRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const scale = ref(1)

let observer: ResizeObserver | null = null
let fitFrame = 0

/**
 * Cards have a fixed on-felt size, so a big board can be much taller than the
 * results panel. Fit the whole tree inside the felt preview instead of cropping
 * it; scrollWidth/scrollHeight stay unscaled, so this is safe to re-measure.
 */
function fitBoard(): void {
  const frame = frameRef.value
  const stage = stageRef.value
  if (!frame || !stage) return

  const availableWidth = frame.clientWidth - 28
  const availableHeight = frame.clientHeight - 28
  if (availableWidth <= 0 || availableHeight <= 0) return

  const contentWidth = stage.scrollWidth
  const contentHeight = stage.scrollHeight
  if (contentWidth <= 0 || contentHeight <= 0) return

  const fit = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight)
  scale.value = Math.max(0.2, Math.round(fit * 1000) / 1000)
}

function scheduleFit(): void {
  if (fitFrame) cancelAnimationFrame(fitFrame)
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0
    fitBoard()
  })
}

watch(
  () => props.node,
  async () => {
    await nextTick()
    scheduleFit()
  }
)

onMounted(() => {
  scheduleFit()
  window.addEventListener('resize', scheduleFit)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleFit)
    if (frameRef.value) observer.observe(frameRef.value)
    // Group headers can grow when the pixel font swaps in; refit to keep them visible.
    if (stageRef.value) observer.observe(stageRef.value)
  }
  if (document.fonts?.ready) void document.fonts.ready.then(scheduleFit)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleFit)
  observer?.disconnect()
  if (fitFrame) cancelAnimationFrame(fitFrame)
})
</script>

<template>
  <div ref="frameRef" class="solution-board">
    <div
      ref="stageRef"
      class="solution-board__stage"
      :style="{ transform: `translate(-50%, -50%) scale(${scale})` }"
    >
      <!-- Root styling and interaction belong to the live board, not this replay. -->
      <CardGroupNode :node="node" :is-root="false" />
    </div>
  </div>
</template>

<style scoped>
.solution-board {
  position: relative;
  height: clamp(180px, 28vh, 280px);
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 48%, #1f4737 0%, #122b21 85%);
  border: 3px solid #2d5a46;
  box-shadow:
    inset 0 0 32px rgba(0, 0, 0, 0.5),
    0 4px 0 rgba(9, 8, 15, 0.8);
}

/* The unscaled stage can be taller than the frame. Grid centering refuses to
   center an overflowing item, so anchor its centre to the frame and let the
   transform shrink it around that point. */
.solution-board__stage {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center center;
}
</style>
