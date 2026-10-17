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

function suitSymbol(suit: string): string {
  switch (suit) {
    case 'spades':
      return '♠'
    case 'hearts':
      return '♥'
    case 'diamonds':
      return '♦'
    case 'clubs':
      return '♣'
    default:
      return ''
  }
}

function isRedSuit(suit: string): boolean {
  return suit === 'hearts' || suit === 'diamonds'
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

    <!-- Leaf card: crisp 3x integer pixel scale (96x141) with top-left value corner -->
    <template v-else>
      <div
        class="playing-card"
        :title="`${node.card.label} of ${node.card.suit} (Value: ${node.card.value})`"
      >
        <div
          class="playing-card-corner"
          :class="{ 'playing-card-corner--red': isRedSuit(node.card.suit) }"
        >
          <span class="corner-rank">{{ node.card.label }}{{ suitSymbol(node.card.suit) }}</span>
          <span class="corner-val">{{ node.card.value }}</span>
        </div>
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
 * Tight vertical stacking:
 * The second card/group is tucked closely under the first so only ~30px of the
 * top card (where the top-left rank/value corner lives) remains exposed!
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
  margin-top: -114px;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 -3px 0 rgba(9, 8, 15, 0.92));
}

/* If the top item in a binary stack is itself a group with a header, leave slightly more room so its header + top card corner show */
.stack-item--top:has(.group-rect) + .stack-item--bottom {
  margin-top: -110px;
}

/* Leaf playing card: crisp 3x integer scale of 32x47 sprite (96x141) */
.playing-card {
  position: relative;
  width: 102px;
  height: 147px;
  background: #f8f2e0;
  border: 3px solid #120e1a;
  box-shadow:
    inset 0 1px 0 #fff,
    0 5px 0 #09080f;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.expr-node--selected > .playing-card {
  border-color: var(--gold);
  box-shadow:
    0 0 0 3px var(--crimson),
    0 8px 0 #09080f;
}

/* Compact top-left corner strip showing rank + numeric value even when tightly stacked */
.playing-card-corner {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(248, 242, 224, 0.94);
  border: 1px solid #120e1a;
  padding: 1px 4px;
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.1;
  color: #120e1a;
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.25);
}

.playing-card-corner--red {
  color: #d62828;
}

.corner-val {
  background: #1a1826;
  color: var(--gold-bright);
  padding: 0 3px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.playing-card-sprite {
  width: 96px;
  height: 141px;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
</style>
