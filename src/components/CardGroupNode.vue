<script setup lang="ts">
import { computed } from 'vue'
import { assetUrl } from '../assetUrl'
import { decimalPlaces } from '../app/displayPrecision'
import type { ExprNode } from '../engine/types'
import { formatNodeHeader, formatNodeValue } from '../engine/math'

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

function onNodeClick(event: Event): void {
  if (!props.isRoot) return
  event.stopPropagation()
  emit('select', props.node.id)
}

function onUngroupClick(event: MouseEvent): void {
  event.stopPropagation()
  emit('ungroup', props.node.id)
}

function rootAriaLabel(node: ExprNode): string {
  const bindName =
    node.kind === 'bind' ? `${node.bind === 'dragon' ? 'Dragon' : 'Rook'} bind, ` : ''
  return `${bindName}card group worth ${formatNodeValue(node, decimalPlaces.value)}`
}

const visibleHeader = computed(() => formatNodeHeader(props.node, decimalPlaces.value))
const headerClass = computed(() => ({
  'group-header-eq--long': visibleHeader.value.length > 30,
  'group-header-eq--very-long': visibleHeader.value.length > 45,
}))

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
      'expr-node--bind': node.kind === 'bind',
      'expr-node--bind-rook': node.kind === 'bind' && node.bind === 'rook',
      'expr-node--leaf': node.kind === 'card',
    }"
    :data-group-id="isRoot ? node.id : undefined"
    :role="isRoot ? 'button' : undefined"
    :tabindex="isRoot ? 0 : undefined"
    :aria-pressed="isRoot ? !!selected : undefined"
    :aria-label="isRoot ? rootAriaLabel(node) : undefined"
    @click="onNodeClick"
    @keydown.enter.prevent="onNodeClick"
    @keydown.space.prevent="onNodeClick"
  >
    <!-- Root value badge & pending binary operator chip -->
    <div v-if="isRoot && pendingSymbol && selected" class="pending-op-chip">
      <span>{{ formatNodeValue(node, decimalPlaces) }} {{ pendingSymbol }} ?</span>
    </div>

    <!-- Floating ungroup action pill when a merged group is selected -->
    <button
      v-if="isRoot && selected && node.kind !== 'card' && node.kind !== 'bind'"
      type="button"
      class="ungroup-pill"
      data-testid="inline-ungroup-btn"
      title="Split this group apart (U)"
      @pointerdown.stop
      @click="onUngroupClick"
    >
      ✂ UNGROUP
    </button>

    <!-- Bind: a locked, free group of cards fanned out like an open hand -->
    <template v-if="node.kind === 'bind'">
      <div
        class="group-rect group-rect--bind"
        :class="node.bind === 'rook' ? 'group-rect--bind-rook' : 'group-rect--bind-dragon'"
        :data-testid="`bind-group-${node.bind}`"
      >
        <div class="group-header group-header--bind">
          <span class="bind-tag">{{ node.bind === 'dragon' ? 'DRAGON' : 'ROOK' }}</span>
          <span class="group-header-eq" :class="headerClass">{{ visibleHeader }}</span>
        </div>
        <div class="group-body group-body--bind">
          <div
            v-for="(card, index) in node.cards"
            :key="card.id"
            class="bind-card"
            :style="{ zIndex: index + 1 }"
          >
            <CardGroupNode :node="card" :is-root="false" />
          </div>
        </div>
      </div>
    </template>

    <!-- Unary wrapper: semi-transparent rectangle with header above operand -->
    <template v-else-if="node.kind === 'unary'">
      <div class="group-rect group-rect--unary">
        <div class="group-header group-header--unary">
          <span class="group-header-eq" :class="headerClass">{{ visibleHeader }}</span>
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
          <span class="group-header-eq" :class="headerClass">{{ visibleHeader }}</span>
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
          :src="assetUrl(node.card.spritePath)"
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

/* Keyboard users can tab between the pieces on the board and pick one up. */
.expr-node--root:focus-visible {
  outline: 3px solid var(--gold-bright, #f5c451);
  outline-offset: 4px;
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

.group-rect--bind {
  border-color: #6fd68a;
  background: rgba(12, 27, 20, 0.8);
}

.group-rect--bind-rook {
  border-color: #c3a6ff;
  background: rgba(24, 18, 35, 0.82);
}

.group-header--bind {
  justify-content: flex-start;
  gap: 6px;
  border-color: rgba(111, 214, 138, 0.7);
  padding: 3px 5px;
}

.group-rect--bind-rook .group-header--bind {
  border-color: rgba(195, 166, 255, 0.7);
}

.bind-tag {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 0.46rem;
  letter-spacing: 0.08em;
  color: #b8f5c8;
  background: rgba(111, 214, 138, 0.16);
  border: 1px solid rgba(111, 214, 138, 0.6);
  padding: 2px 4px;
}

.group-rect--bind-rook .bind-tag {
  color: #e4d6ff;
  background: rgba(195, 166, 255, 0.16);
  border-color: rgba(195, 166, 255, 0.6);
}

/* Two classes so this wins over the later base `.group-body` column rule. */
.group-body.group-body--bind {
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  padding: 0 2px 2px;
}

.bind-card {
  position: relative;
  flex: none;
}

/* Each card starts 30px after the one before, so the rank/suit corner stays
   readable while the fanned stack keeps a bind compact on the felt. */
.bind-card + .bind-card {
  margin-left: -66px;
}

.bind-card:nth-child(even) {
  margin-top: 5px;
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

/* Full-precision headers can be fifty characters wide; shrink them instead of
   spilling across the felt or stretching the group rectangle. */
.group-header-eq--long {
  font-size: 0.68rem;
  letter-spacing: 0;
}

.group-header-eq--very-long {
  font-size: 0.52rem;
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
