<script setup lang="ts">
import type { ExprNode } from '../engine/types'
import { formatNumber } from '../engine/math'

const props = defineProps<{
  node: ExprNode
  isRoot?: boolean
  selected?: boolean
  pendingSymbol?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'ungroup', id: string): void
}>()

function onNodeClick(event: MouseEvent): void {
  if (!props.isRoot) return
  event.stopPropagation()
  emit('select', props.node.id)
}

function onUngroupClick(event: MouseEvent): void {
  event.stopPropagation()
  emit('ungroup', props.node.id)
}

</script>

<template>
  <!-- Root or nested node wrapper -->
  <div
    class="expr-node"
    :class="{
      'expr-node--root': isRoot,
      'expr-node--selected': isRoot && selected,
      'expr-node--unary': node.kind === 'unary',
      'expr-node--binary': node.kind === 'binary',
      'expr-node--leaf': node.kind === 'card',
    }"
    :data-group-id="isRoot ? node.id : undefined"
    @click="onNodeClick"
  >
    <!-- Root value badge & pending binary operator chip -->
    <div v-if="isRoot && pendingSymbol && selected" class="pending-op-chip">
      <span>{{ formatNumber(node.value) }} {{ pendingSymbol }} ?</span>
    </div>

    <!-- Floating ungroup action pill when a merged group is selected -->
    <button
      v-if="isRoot && selected && node.kind !== 'card'"
      type="button"
      class="ungroup-pill"
      data-testid="inline-ungroup-btn"
      title="Split this group apart (U)"
      @pointerdown.stop
      @click="onUngroupClick"
    >
      ✂ UNGROUP
    </button>

    <!-- Unary wrapper: semi-transparent rectangle with header above operand -->
    <template v-if="node.kind === 'unary'">
      <div class="group-rect group-rect--unary">
        <div class="group-header group-header--unary">
          <span class="group-header-eq">{{ node.headerText }}</span>
        </div>
        <div class="group-body">
          <CardGroupNode :node="node.operand" :is-root="false" />
        </div>
      </div>
    </template>

    <!-- Binary wrapper: semi-transparent rectangle with header above tightly stacked operands -->
    <template v-else-if="node.kind === 'binary'">
      <div class="group-rect group-rect--binary">
        <div class="group-header group-header--binary">
          <span class="group-header-eq">{{ node.headerText }}</span>
        </div>
        <div class="group-body group-body--stack">
          <div class="stack-item stack-item--top">
            <CardGroupNode :node="node.left" :is-root="false" />
          </div>
          <div class="stack-item stack-item--bottom">
            <CardGroupNode :node="node.right" :is-root="false" />
          </div>
        </div>
      </div>
    </template>

    <!-- Leaf card: crisp 3x integer pixel scale (96x141); the sprite already shows rank & value -->
    <template v-else>
      <div
        class="playing-card"
        :title="`${node.card.label} of ${node.card.suit} (Value: ${node.card.value})`"
      >
        <img
          :src="node.card.spritePath"
          :alt="`${node.card.label} of ${node.card.suit}`"
          class="playing-card-sprite"
          draggable="false"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.expr-node {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  transition: transform 0.14s cubic-bezier(0.22, 1, 0.36, 1), filter 0.14s ease;
}

.expr-node--root {
  cursor: grab;
  animation: balatro-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.expr-node--root:hover:not(.expr-node--selected) {
  transform: translateY(-6px) rotate(-1deg);
  filter: drop-shadow(0 8px 0 rgba(8, 10, 14, 0.75));
}

.expr-node--root:active {
  cursor: grabbing;
}

.expr-node--selected {
  transform: translateY(-12px) scale(1.04);
  animation: pulse-glow 1.8s infinite ease-in-out;
  z-index: 18;
}

.pending-op-chip {
  position: absolute;
  top: -36px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--crimson);
  color: #fff;
  border: 2px solid #fff;
  outline: 2px solid #09080f;
  padding: 4px 10px;
  font-family: var(--font-pixel);
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 0 #09080f;
  z-index: 25;
  letter-spacing: 0.04em;
}

.ungroup-pill {
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--crimson);
  color: #fff;
  border: 2px solid #fff;
  outline: 2px solid #09080f;
  padding: 3px 10px;
  font-family: var(--font-pixel);
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 4px 0 #09080f;
  z-index: 25;
}

.ungroup-pill:hover {
  background: var(--gold);
  color: #15111e;
}

/* Semi-transparent rectangle around unary / binary card groups */
.group-rect {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  background: rgba(12, 18, 26, 0.66);
  border: 2px solid rgba(255, 190, 11, 0.85);
  outline: 2px solid #09080f;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 5px 0 rgba(8, 10, 14, 0.82);
  padding: 4px 4px 5px;
  min-width: 108px;
}

.group-rect--unary {
  border-color: #2ec4b6;
}

.expr-node--selected > .group-rect {
  border-color: #fff;
  background: rgba(24, 34, 48, 0.82);
  box-shadow:
    0 0 0 3px var(--crimson),
    0 8px 0 #09080f;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #14111f;
  border: 1px solid rgba(255, 190, 11, 0.55);
  padding: 3px 6px;
  margin-bottom: 4px;
  min-height: 22px;
}

.group-header--unary {
  border-color: rgba(46, 196, 182, 0.7);
}

.group-header-eq {
  font-family: var(--font-mono);
  font-size: 1rem;
  line-height: 1;
  font-weight: 700;
  color: var(--gold-bright);
  white-space: nowrap;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 0 #000;
}

.group-header--unary .group-header-eq {
  color: #72efdd;
}

.group-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/*
 * Tight vertical stacking: the second card/group is tucked closely under the first
 * so only a thin slice of the upper item peeks out, keeping tall nested stacks
 * inside the felt viewport.
 */
.group-body--stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.stack-item {
  display: flex;
  justify-content: center;
}

.stack-item--top {
  position: relative;
  z-index: 1;
}

.stack-item--bottom {
  margin-top: -117px;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 -3px 0 rgba(9, 8, 15, 0.92));
}

/* If the top item in a binary stack is itself a group with a header, leave slightly more room so its header stays legible */
.stack-item--top:has(.group-rect) + .stack-item--bottom {
  margin-top: -106px;
}

/* Leaf playing card: the 32x47 sprite at 3x (96x141) is the whole card —
   no background plate, frame or inset shadow layered behind the art. */
.playing-card {
  position: relative;
  width: 96px;
  height: 141px;
  line-height: 0;
  filter: drop-shadow(0 4px 0 rgba(9, 8, 15, 0.8));
}

.expr-node--selected > .playing-card {
  filter:
    drop-shadow(0 0 5px var(--gold)) drop-shadow(0 0 10px rgba(254, 74, 73, 0.8))
    drop-shadow(0 4px 0 rgba(9, 8, 15, 0.8));
}

.playing-card-sprite {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
</style>
