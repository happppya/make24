<script setup lang="ts">
import { useGameContext } from '../../app/context'
import { formatTimer, opKeyLabel } from '../../app/labels'
import CardGroupNode from '../CardGroupNode.vue'
import ScorePanel from '../ScorePanel.vue'
import { getGroupPosition } from '../../engine/workspace'

const {
  menuOpen,
  tutorialOpen,
  settings,
  roundNumber,
  currentTarget,
  currentEvaluation,
  costBreakdown,
  hitSignal,
  workspaces,
  activeWorkspace,
  activeWorkspaceIdx,
  switchWorkspace,
  remainingSeconds,
  multiplayerHost,
  finishRound,
  endEntireGameNow,
  awaitingNextDeal,
  actionError,
  pendingOperatorMeta,
  currentHand,
  binaryOperators,
  unaryOperators,
  canUngroupSelected,
  hoveredOperatorLabel,
  hoveredActionLabel,
  hoveredPanLabel,
  activeDrag,
  handleGroupPointerDown,
  handleCanvasPointerDown,
  handleCanvasWheel,
  handleRecenterView,
  handleTidyBoard,
  handleSelectGroup,
  handleUngroup,
  handleApplyOperator,
  handleUndo,
  handleRedo,
  handleResetWorkspace,
  feltRef,
  sidebarRef,
  viewportRef,
  panGlide,
  tidyingBoard,
  floatingCues,
} = useGameContext()

// The lookups above are bound to elements in the template as string refs, which
// vue-tsc does not count as a use; this keeps them from reading as dead bindings.
void [feltRef, sidebarRef, viewportRef]
</script>

<template>
<main class="screen-playing" :inert="menuOpen || tutorialOpen">
  <div class="table-layout">
    <!-- ============ Left blind / score sidebar (Balatro HUD) ============ -->
    <aside ref="sidebarRef" class="table-sidebar">
      <ScorePanel
        :round-number="roundNumber"
        :target="currentTarget"
        :approximation-percent="settings.approximationPercent"
        :value="currentEvaluation?.finalValue ?? null"
        :error-percent="currentEvaluation?.errorPercent ?? null"
        :score="currentEvaluation?.score ?? null"
        :acceptable="!!(currentEvaluation?.isSingleGroup && currentEvaluation.acceptable)"
        :cost-breakdown="costBreakdown"
        :hit-signal="hitSignal"
      />

      <div class="sidebar-panel">
        <div class="sidebar-panel__title">Workspaces</div>
        <div class="workspace-stack">
          <button
            v-for="ws in workspaces"
            :key="ws.index"
            type="button"
            class="ws-tab"
            :class="{ 'ws-tab--active': ws.index === activeWorkspaceIdx }"
            :data-testid="`workspace-tab-${ws.index + 1}`"
            @click="switchWorkspace(ws.index)"
          >
            <span class="ws-tab-num">W{{ ws.index + 1 }}</span>
            <span class="ws-tab-key">⌥{{ ws.index + 1 }}</span>
          </button>
        </div>
      </div>

      <div
        v-if="settings.isMultiplayer && remainingSeconds !== null"
        class="sidebar-timer"
        :class="{ 'sidebar-timer--urgent': remainingSeconds <= 10 }"
      >
        <span class="sidebar-timer__label">TIME LEFT</span>
        <span class="sidebar-timer__digits">{{ formatTimer(remainingSeconds) }}</span>
      </div>

      <div class="sidebar-actions">
        <button
          v-if="!settings.isMultiplayer || settings.mode !== 'first-to-solve'"
          type="button"
          class="btn-arcade btn-arcade--gold btn-arcade--block"
          data-testid="finish-round-btn"
          :disabled="settings.isMultiplayer && !multiplayerHost"
          @click="finishRound('player-end')"
        >
          {{ settings.isMultiplayer ? 'End Round' : 'Submit' }}
        </button>
        <button
          type="button"
          class="btn-arcade btn-arcade--block"
          data-testid="skip-round-btn"
          :disabled="settings.isMultiplayer && !multiplayerHost"
          @click="finishRound('skip')"
        >
          Skip Round
        </button>
        <button
          type="button"
          class="btn-arcade btn-arcade--crimson btn-arcade--block"
          :disabled="settings.isMultiplayer && !multiplayerHost"
          @click="endEntireGameNow"
        >
          End Match
        </button>
      </div>
    </aside>

    <!-- ============ Table ============ -->
    <div class="table-main">
      <div
        v-if="awaitingNextDeal"
        class="waiting-banner"
        role="status"
        data-testid="waiting-banner"
      >
        <span class="waiting-banner__badge">NEXT DEAL</span>
        <span class="waiting-banner__copy">
          You joined mid-round, so this hand is a spectator's view. You're dealt in when the
          next round starts.
        </span>
      </div>

      <div
        v-if="currentEvaluation && currentEvaluation.isSingleGroup"
        class="equation-ribbon"
        :class="currentEvaluation.acceptable ? 'equation-ribbon--good' : 'equation-ribbon--bad'"
        data-testid="solution-status-badge"
      >
        <span class="equation-ribbon__tag">
          {{ currentEvaluation.acceptable ? 'ACCEPTABLE' : 'NOT ACCEPTABLE' }}
        </span>
        <span class="equation-ribbon__eq">{{ currentEvaluation.equation }}</span>
        <span class="equation-ribbon__score">{{ currentEvaluation.score }} pts</span>
      </div>
      <div v-else class="equation-ribbon equation-ribbon--idle" data-testid="solution-status-incomplete">
        <span class="equation-ribbon__tag">MERGING</span>
        <span class="equation-ribbon__eq">
          {{ activeWorkspace?.groups.length ?? 0 }} / {{ currentHand.length }} groups
        </span>
      </div>

    <!-- Interactive Felt Board for Active Workspace -->
    <section ref="feltRef" class="felt-table" :class="{ 'felt-table--waiting': awaitingNextDeal }">
      <div class="board-toasts">
        <span v-if="actionError" class="error-toast" role="alert">⚠ {{ actionError }}</span>
        <span
          v-if="activeWorkspace?.pendingOperator && pendingOperatorMeta"
          class="pending-chip"
          data-testid="pending-operator-banner"
        >
          {{ pendingOperatorMeta.shortSymbol }} → pick the 2nd card
        </span>
      </div>

      <!-- Pannable workspace plane -->
      <div
        v-if="activeWorkspace"
        ref="viewportRef"
        class="workspace-viewport"
        :class="{ 'workspace-viewport--panning': activeDrag?.kind === 'pan' && activeDrag.moved }"
        data-testid="workspace-canvas"
        @pointerdown="handleCanvasPointerDown"
        @wheel="handleCanvasWheel"
      >
        <div
          class="workspace-plane"
          data-testid="workspace-plane"
          :style="{
            transform: `translate3d(${activeWorkspace.panX}px, ${activeWorkspace.panY}px, 0)`,
            transition: panGlide
              ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          }"
          :class="{ 'workspace-plane--tidying': tidyingBoard }"
        >
          <div
            v-for="(group, idx) in activeWorkspace.groups"
            :key="group.id"
            class="draggable-group-slot"
            :class="{
              'draggable-group-slot--selected': activeWorkspace.selectedGroupId === group.id,
              'draggable-group-slot--dragging':
                activeDrag?.kind === 'group' &&
                activeDrag.groupId === group.id &&
                activeDrag.moved,
            }"
            :data-testid="`group-slot-${group.id}`"
            :style="{
              left: `${getGroupPosition(activeWorkspace, group.id, idx).x}px`,
              top: `${getGroupPosition(activeWorkspace, group.id, idx).y}px`,
            }"
            @pointerdown="(e) => handleGroupPointerDown(e, group.id, idx)"
          >
            <CardGroupNode
              :node="group"
              :is-root="true"
              :selected="activeWorkspace.selectedGroupId === group.id"
              :pending-symbol="
                activeWorkspace.selectedGroupId === group.id
                  ? pendingOperatorMeta?.shortSymbol ?? null
                  : null
              "
              @select="handleSelectGroup"
              @ungroup="handleUngroup"
            />
          </div>
        </div>
      </div>

      <!-- Operators: vertical rail, top right -->
      <div class="op-rail" role="group" aria-label="Operators">
        <div class="op-rail__group">
          <span class="op-rail__tag" aria-hidden="true">B</span>
          <button
            v-for="(op, idx) in binaryOperators"
            :key="op.id"
            type="button"
            class="op-square btn-op"
            :class="{ 'btn-op--active': activeWorkspace?.pendingOperator === op.id }"
            :disabled="!activeWorkspace?.selectedGroupId"
            :data-testid="`op-${op.id}`"
            :aria-label="`${op.label} (${op.shortSymbol}), key ${opKeyLabel(idx)}`"
            @mouseenter="hoveredOperatorLabel = op.label"
            @mouseleave="hoveredOperatorLabel = null"
            @focus="hoveredOperatorLabel = op.label"
            @blur="hoveredOperatorLabel = null"
            @click="handleApplyOperator(op.id)"
          >
            <span class="op-square__sym">{{ op.shortSymbol }}</span>
            <span class="op-key">{{ opKeyLabel(idx) }}</span>
          </button>
        </div>

        <div v-if="unaryOperators.length > 0" class="op-rail__group">
          <span class="op-rail__tag op-rail__tag--unary" aria-hidden="true">U</span>
          <button
            v-for="(op, idx) in unaryOperators"
            :key="op.id"
            type="button"
            class="op-square btn-op btn-op--unary"
            :disabled="!activeWorkspace?.selectedGroupId"
            :data-testid="`op-${op.id}`"
            :aria-label="`${op.label} (${op.shortSymbol}), key shift+${opKeyLabel(idx)}`"
            @mouseenter="hoveredOperatorLabel = op.label"
            @mouseleave="hoveredOperatorLabel = null"
            @focus="hoveredOperatorLabel = op.label"
            @blur="hoveredOperatorLabel = null"
            @click="handleApplyOperator(op.id)"
          >
            <span class="op-square__sym">{{ op.shortSymbol }}</span>
            <span class="op-key">⇧{{ opKeyLabel(idx) }}</span>
          </button>
        </div>
      </div>

      <span v-if="hoveredOperatorLabel" class="rail-hint" aria-hidden="true">
        {{ hoveredOperatorLabel }}
      </span>

      <!-- Group & history actions: horizontal, bottom right -->
      <div class="board-actions">
        <button
          type="button"
          class="board-action"
          :disabled="!canUngroupSelected"
          data-testid="ungroup-btn"
          aria-label="Ungroup selected group (U)"
          @mouseenter="hoveredActionLabel = 'Ungroup · U'"
          @mouseleave="hoveredActionLabel = null"
          @focus="hoveredActionLabel = 'Ungroup · U'"
          @blur="hoveredActionLabel = null"
          @click="handleUngroup()"
        >
          <span class="board-action__icon" aria-hidden="true">✂</span>
        </button>
        <button
          type="button"
          class="board-action"
          :disabled="!activeWorkspace || activeWorkspace.undoStack.length === 0"
          data-testid="undo-btn"
          aria-label="Undo (Z)"
          @mouseenter="hoveredActionLabel = 'Undo · Z'"
          @mouseleave="hoveredActionLabel = null"
          @focus="hoveredActionLabel = 'Undo · Z'"
          @blur="hoveredActionLabel = null"
          @click="handleUndo"
        >
          <span class="board-action__icon" aria-hidden="true">↶</span>
        </button>
        <button
          type="button"
          class="board-action"
          :disabled="!activeWorkspace || activeWorkspace.redoStack.length === 0"
          data-testid="redo-btn"
          aria-label="Redo (Y)"
          @mouseenter="hoveredActionLabel = 'Redo · Y'"
          @mouseleave="hoveredActionLabel = null"
          @focus="hoveredActionLabel = 'Redo · Y'"
          @blur="hoveredActionLabel = null"
          @click="handleRedo"
        >
          <span class="board-action__icon" aria-hidden="true">↷</span>
        </button>
        <button
          type="button"
          class="board-action"
          data-testid="reset-workspace-btn"
          aria-label="Reset workspace to the dealt hand"
          @mouseenter="hoveredActionLabel = 'Reset workspace'"
          @mouseleave="hoveredActionLabel = null"
          @focus="hoveredActionLabel = 'Reset workspace'"
          @blur="hoveredActionLabel = null"
          @click="handleResetWorkspace"
        >
          <span class="board-action__icon" aria-hidden="true">⟲</span>
        </button>
      </div>
      <span v-if="hoveredActionLabel" class="actions-hint" aria-hidden="true">
        {{ hoveredActionLabel }}
      </span>

      <!-- Pan readout + recenter + tidy: bottom left -->
      <div class="board-pan">
        <span class="pan-coords" data-testid="pan-coords">
          {{ activeWorkspace?.panX ?? 0 }}, {{ activeWorkspace?.panY ?? 0 }}
        </span>
        <button
          type="button"
          class="board-icon-btn"
          data-testid="recenter-view-btn"
          aria-label="Center view"
          title="Center view"
          @mouseenter="hoveredPanLabel = 'Center view'"
          @mouseleave="hoveredPanLabel = null"
          @focus="hoveredPanLabel = 'Center view'"
          @blur="hoveredPanLabel = null"
          @click="handleRecenterView"
        >
          <span aria-hidden="true">⌖</span>
        </button>
        <button
          type="button"
          class="board-icon-btn"
          data-testid="tidy-board-btn"
          aria-label="Tidy cards into a grid"
          title="Tidy cards"
          @mouseenter="hoveredPanLabel = 'Tidy cards'"
          @mouseleave="hoveredPanLabel = null"
          @focus="hoveredPanLabel = 'Tidy cards'"
          @blur="hoveredPanLabel = null"
          @click="handleTidyBoard"
        >
          <span aria-hidden="true">▦</span>
        </button>
      </div>
      <span v-if="hoveredPanLabel" class="pan-hint" aria-hidden="true">
        {{ hoveredPanLabel }}
      </span>

      <div class="cue-layer" aria-hidden="true">
        <span
          v-for="cue in floatingCues"
          :key="cue.id"
          class="float-cue"
          :class="`float-cue--${cue.tone}`"
          :style="{ left: `${cue.offsetX}%` }"
        >
          {{ cue.text }}
        </span>
      </div>
    </section>
    </div>
  </div>
</main>
</template>

<style scoped>
/* ------------------------ seated mid-round (waiting) ------------------------ */
.waiting-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 9px 12px;
  background: rgba(255, 190, 11, 0.1);
  border: 2px solid var(--gold);
  border-left-width: 6px;
  box-shadow: 0 4px 0 #09080f;
}

.waiting-banner__badge {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  color: #15111e;
  background: var(--gold);
}

.waiting-banner__copy {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.3;
  color: rgba(247, 240, 224, 0.82);
}

.felt-table--waiting .workspace-viewport {
  pointer-events: none;
  filter: saturate(0.55) brightness(0.85);
}

/* Playing Screen: Balatro-ish table with left HUD rail, filling the viewport */
.screen-playing {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 14px 20px 18px;
  max-width: 1520px;
  width: 100%;
  margin: 0 auto;
}

.table-layout {
  display: grid;
  grid-template-columns: 262px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.table-sidebar {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.table-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 1000px) {
    .table-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .table-sidebar {
      position: static;
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }
    .sidebar-actions {
      grid-column: 1 / -1;
      flex-direction: row;
      flex-wrap: wrap;
    }
    .sidebar-actions .btn-arcade {
      flex: 1;
    }
}

@media (max-width: 640px) {
    .table-sidebar {
      grid-template-columns: 1fr;
    }
    .sidebar-actions {
      grid-column: auto;
      flex-direction: column;
    }
    .screen-playing {
      padding: 10px 12px 22px;
    }
}

.sidebar-panel {
  background: #13111c;
  border: 3px solid #3a3550;
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 8px 10px 10px;
}

.sidebar-panel__title {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 6px;
}

.workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ws-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1d1830;
  color: var(--ink-cream);
  border: 2px solid #3a3550;
  padding: 5px 8px;
  font-family: var(--font-pixel);
  text-align: left;
  cursor: pointer;
  transition: transform 0.1s steps(2), border-color 0.12s ease, background 0.12s ease;
}

.ws-tab:hover {
  border-color: var(--gold);
  transform: translateX(2px);
}

.ws-tab--active {
  background: var(--gold);
  border-color: #fff9db;
  color: #15111e;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.28);
  transform: translateX(3px);
}

.ws-tab-num {
  font-weight: 800;
  font-size: 0.82rem;
}

.ws-tab-key {
  margin-left: auto;
  font-size: 0.56rem;
  opacity: 0.55;
  border: 1px solid currentColor;
  padding: 0 3px;
}

.sidebar-timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #120f18;
  border: 3px solid var(--crimson);
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 6px 10px;
}

.sidebar-timer__label {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.2em;
  color: var(--ink-muted);
}

.sidebar-timer__digits {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  line-height: 1;
  color: #ffccd5;
}

.sidebar-timer--urgent {
  animation: timer-throb 0.85s steps(2, end) infinite;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Equation ribbon above the felt */
.equation-ribbon {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 12px;
  border: 3px solid;
  outline: 3px solid #09080f;
  box-shadow: 0 5px 0 #09080f;
  font-size: 0.86rem;
  min-height: 44px;
}

.equation-ribbon--good {
  background: rgba(46, 196, 182, 0.16);
  border-color: var(--emerald);
  color: #d8fffa;
}

.equation-ribbon--bad {
  background: rgba(254, 74, 73, 0.14);
  border-color: var(--crimson);
  color: #ffd9d9;
}

.equation-ribbon--idle {
  background: rgba(255, 255, 255, 0.04);
  border-color: #3a3550;
  color: var(--ink-muted);
}

.equation-ribbon__tag {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  padding: 3px 6px;
  background: #09080f;
  color: var(--gold);
  white-space: nowrap;
}

.equation-ribbon__eq {
  font-family: var(--font-mono);
  font-size: 1.08rem;
  color: #fff;
  overflow-wrap: anywhere;
}

.equation-ribbon__score {
  margin-left: auto;
  font-family: var(--font-pixel);
  font-size: 0.68rem;
  background: var(--gold);
  color: #15111e;
  padding: 3px 7px;
  white-space: nowrap;
}

.equation-ribbon--idle .equation-ribbon__tag {
  color: #72efdd;
}

/* Floating operation cues over the felt */
.cue-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.float-cue {
  position: absolute;
  top: 34%;
  left: 50%;
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f, 0 0 12px rgba(255, 190, 11, 0.5);
  white-space: nowrap;
  animation: cue-rise 1s cubic-bezier(0.2, 1, 0.3, 1) forwards;
}

.float-cue--bad {
  color: var(--crimson);
}

.float-cue--good {
  color: #72efdd;
}

@keyframes cue-rise {
  0% {
    opacity: 0;
    transform: translate(-50%, 14px) scale(0.78);
  }
  22% {
    opacity: 1;
    transform: translate(-50%, -8px) scale(1.12);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -72px) scale(1);
  }
}

@keyframes timer-throb {
  50% {
    background: #2a0f16;
    box-shadow: 0 0 0 3px rgba(254, 74, 73, 0.45), 0 6px 0 #09080f;
  }
}

/* Felt Board — fills whatever height the screen has left */
.felt-table {
  position: relative;
  flex: 1;
  min-height: 380px;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 50% 50%, #1f4737 0%, #122b21 85%);
  border: 4px solid #2d5a46;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.55),
    0 8px 0 #0b0910;
  overflow: hidden;
}

/* Top-left status: errors and the waiting-for-operand chip */
.board-toasts {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}

.error-toast {
  background: var(--crimson);
  color: #fff;
  padding: 4px 10px;
  font-weight: 800;
  font-size: 0.82rem;
  border: 2px solid #09080f;
}

.pending-chip {
  background: rgba(12, 15, 22, 0.92);
  border: 2px solid var(--gold);
  color: var(--gold);
  padding: 4px 10px;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pan-coords {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: rgba(247, 240, 224, 0.5);
  background: rgba(10, 13, 18, 0.62);
  border: 1px solid rgba(242, 201, 76, 0.22);
  padding: 3px 7px;
}

/* Workspace viewport with infinite pan plane — grows to the felt's bottom */
.workspace-viewport {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  background-image: radial-gradient(rgba(242, 201, 76, 0.14) 1px, transparent 1px);
  background-size: 28px 28px;
}

.workspace-viewport--panning {
  cursor: grabbing;
}

.workspace-plane {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.draggable-group-slot {
  position: absolute;
  z-index: 2;
  user-select: none;
  touch-action: none;
}

.draggable-group-slot--selected {
  z-index: 12;
}

.draggable-group-slot--dragging {
  z-index: 25;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.65));
}

/* Operator rail: vertical, floating over the top-right of the felt */
.op-rail {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 30;
  width: 58px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 7px 6px;
  max-height: calc(100% - 20px);
  overflow-y: auto;
  scrollbar-width: thin;
  background: rgba(10, 13, 20, 0.84);
  border: 2px solid rgba(242, 201, 76, 0.45);
  box-shadow: 0 5px 0 rgba(9, 8, 15, 0.65);
  backdrop-filter: blur(2px);
}

.op-rail__group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.op-rail__tag {
  width: 100%;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(242, 201, 76, 0.3);
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.12em;
  text-align: center;
  color: var(--gold);
}

.op-rail__tag--unary {
  color: #72efdd;
  border-color: rgba(114, 239, 221, 0.3);
}

.op-square {
  position: relative;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0;
  background: #241e33;
  border: 2px solid #4a4166;
  box-shadow: 0 3px 0 #09080f;
  color: var(--gold);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.14s ease,
    background 0.14s ease;
}

.op-square:hover:not(:disabled),
.op-square:focus-visible {
  background: #302846;
  border-color: var(--gold-bright);
  transform: translateY(-2px);
}

.op-square:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.op-square__sym {
  font-family: var(--font-mono);
  font-size: 0.98rem;
  font-weight: 900;
  line-height: 1;
}

.btn-op--unary {
  border-color: rgba(114, 239, 221, 0.5);
  color: #72efdd;
}

.btn-op--active {
  background: var(--crimson);
  border-color: #fff;
  color: #fff;
}

.op-key {
  position: absolute;
  top: 1px;
  right: 3px;
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--gold-bright);
  opacity: 0.75;
  pointer-events: none;
}

.btn-op--unary .op-key {
  color: #72efdd;
}

.btn-op:disabled .op-key {
  opacity: 0.4;
}

/* Hover name plates, rendered outside the scrolling rail so they cannot clip */
.rail-hint,
.actions-hint,
.pan-hint {
  position: absolute;
  z-index: 40;
  padding: 5px 9px;
  background: #0d0b14;
  border: 2px solid var(--gold);
  color: var(--ink-cream);
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
  pointer-events: none;
  animation: hint-in 0.1s ease-out;
}

.rail-hint {
  top: 18px;
  right: calc(10px + 58px + 10px);
}

.actions-hint {
  right: 12px;
  bottom: calc(12px + 40px + 10px);
}

.pan-hint {
  left: 12px;
  bottom: calc(12px + 34px + 10px);
}

/* Cards ease into a tidied grid instead of teleporting; only while tidying, so
   dragging a slot around never lags behind the pointer. */
.workspace-plane--tidying .draggable-group-slot {
  transition:
    left 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes hint-in {
  from {
    opacity: 0;
    transform: translateX(4px);
  }
}

/* Group & history actions: bottom-right, horizontal */
.board-actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  gap: 8px;
}

.board-action {
  position: relative;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(18, 15, 27, 0.9);
  border: 2px solid rgba(242, 201, 76, 0.4);
  box-shadow: 0 3px 0 #09080f;
  color: var(--ink-cream);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.board-action:hover:not(:disabled),
.board-action:focus-visible {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
  transform: translateY(-2px);
}

.board-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.board-action__icon {
  font-size: 1rem;
  line-height: 1;
}

/* Pan readout + recenter: bottom-left */
.board-pan {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
}

.board-icon-btn {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(18, 15, 27, 0.9);
  border: 2px solid rgba(242, 201, 76, 0.35);
  color: var(--ink-cream);
  cursor: pointer;
  transition:
    color 0.14s ease,
    border-color 0.14s ease;
}

.board-icon-btn:hover,
.board-icon-btn:focus-visible {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}

/* Board overlays shrink with the screen; kept last so they beat the base sizes */
@media (max-width: 1000px) {
    .felt-table {
      min-height: 420px;
    }
    /* Narrow boards: wrap the rail into two columns so no operator hides behind a scrollbar */
    .op-rail {
      width: auto;
    }
    .op-rail__group {
      display: grid;
      grid-template-columns: repeat(2, auto);
      justify-items: center;
    }
    .op-rail__tag {
      grid-column: 1 / -1;
    }
    .rail-hint {
      right: calc(10px + 106px + 10px);
    }
}

@media (max-width: 640px) {
    .op-rail {
      top: 8px;
      right: 8px;
      width: auto;
      gap: 4px;
      padding: 5px 4px;
      /* stop above the bottom-right action bar */
      max-height: calc(100% - 62px);
    }
    .rail-hint {
      top: 16px;
      right: calc(8px + 80px + 10px);
    }
    .op-square {
      width: 32px;
      height: 32px;
    }
    .op-square__sym {
      font-size: 0.86rem;
    }
    .board-actions {
      right: 8px;
      bottom: 8px;
      gap: 6px;
    }
    .board-action {
      width: 36px;
      height: 36px;
    }
    .board-pan {
      left: 8px;
      bottom: 8px;
    }
    .board-icon-btn {
      width: 32px;
      height: 32px;
    }
    .pan-hint {
      left: 8px;
      bottom: calc(8px + 32px + 10px);
    }
    .board-pan .pan-coords {
      display: none;
    }
}
</style>
