<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useGameContext } from '../../app/context'
import { decimalPlaces } from '../../app/displayPrecision'
import { formatScore, formatTimer, opKeyLabel } from '../../app/labels'
import CardGroupNode from '../CardGroupNode.vue'
import PuzzlePlayHeader from './PuzzlePlayHeader.vue'
import ScorePanel from '../ScorePanel.vue'
import { formatFullEquation } from '../../engine/math'
import { getGroupPosition, getGroupStackRank } from '../../engine/workspace'

/** Accessible name for a rail button, including its digit key when it has one. */
function operatorAriaLabel(label: string, symbol: string, index: number, unary: boolean): string {
  const key = opKeyLabel(index)
  if (!key) return `${label} (${symbol})`
  return `${label} (${symbol}), key ${unary ? 'shift+' : ''}${key}`
}

const {
  menuOpen,
  tutorialOpen,
  settings,
  activePuzzle,
  canSubmit,
  submitting,
  finishPuzzle,
  exitPuzzleToHub,
  roundNumber,
  currentTarget,
  currentTargetExact,
  currentConstant,
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
  particleBursts,
  glideToGroups,
} = useGameContext()

/** The ribbon follows the same display width as the target and board headers. */
const equationText = computed(() => {
  const evaluation = currentEvaluation.value
  if (!evaluation?.rootNode) return evaluation?.equation ?? ''
  return formatFullEquation(evaluation.rootNode, decimalPlaces.value)
})

/* Frame the dealt cards whenever the hand or workspace changes, and after the
   felt is resized (orientation change, HUD reflow). The board is pannable, but
   it should never open with cards sitting outside the visible area. */
function fitBoardToViewport(): void {
  const ws = activeWorkspace.value
  if (!ws || ws.groups.length === 0) return
  void glideToGroups(ws, ws.groups.map((group) => group.id))
}

watch(
  [() => currentHand.value.map((card) => card.id).join('|'), activeWorkspaceIdx],
  fitBoardToViewport,
  { immediate: true }
)

let fitTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null

function handleViewportResize(): void {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(fitBoardToViewport, 160)
}

onMounted(() => {
  // The hub can be scrolled when a puzzle starts; the table owns the viewport.
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  window.addEventListener('resize', handleViewportResize)
  if (!viewportRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(handleViewportResize)
  resizeObserver.observe(viewportRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
  resizeObserver?.disconnect()
  if (fitTimer) clearTimeout(fitTimer)
})

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
        :target-exact="currentTargetExact"
        :constant="currentConstant"
        :approximation-percent="settings.approximationPercent"
        :scoring-mode="settings.scoringMode"
        :value="currentEvaluation?.finalValue ?? null"
        :error-percent="currentEvaluation?.errorPercent ?? null"
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
            <span class="ws-tab-num"><span class="ws-tab-w">W</span>{{ ws.index + 1 }}</span>
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
        <template v-if="activePuzzle">
          <button
            type="button"
            class="btn-arcade btn-arcade--gold btn-arcade--block"
            data-testid="puzzle-submit-btn"
            :disabled="!canSubmit || submitting"
            @click="finishPuzzle"
          >
            {{ submitting ? 'Saving…' : 'Submit Solution' }}
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--block"
            data-testid="puzzle-quit-btn"
            @click="exitPuzzleToHub"
          >
            Back to Puzzles
          </button>
        </template>
        <template v-else>
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
        </template>
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

      <PuzzlePlayHeader v-if="activePuzzle" />

      <div
        v-if="currentEvaluation && currentEvaluation.isSingleGroup"
        class="equation-ribbon"
        :class="currentEvaluation.acceptable ? 'equation-ribbon--good' : 'equation-ribbon--bad'"
        data-testid="solution-status-badge"
      >
        <span class="equation-ribbon__tag">
          {{ currentEvaluation.acceptable ? 'ACCEPTABLE' : 'NOT ACCEPTABLE' }}
        </span>
        <span class="equation-ribbon__eq">{{ equationText }}</span>
        <span class="equation-ribbon__score">{{ formatScore(currentEvaluation.score) }} pts</span>
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
            // The origin is the viewport centre; pan is an offset from it.
            transform: `translate(50%, 50%) translate(${activeWorkspace.panX}px, ${activeWorkspace.panY}px)`,
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
              // Recency wins: the piece last selected or picked up draws on top.
              zIndex: 2 + getGroupStackRank(activeWorkspace, group.id),
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

          <!-- Pixel particles: merge sparks, split shards, operator motes, hit
               confetti. The layer lives on the plane so bursts travel with the
               camera instead of being left behind by a glide or manual pan. -->
          <div class="particle-layer" aria-hidden="true" data-testid="particle-layer">
            <template v-for="burst in particleBursts" :key="burst.id">
              <span
                v-for="particle in burst.particles"
                :key="`${burst.id}-${particle.id}`"
                class="felt-particle"
                :class="`felt-particle--${particle.shape}`"
                :style="{
                  left: `${particle.originX}px`,
                  top: `${particle.originY}px`,
                  '--dx': `${particle.dx.toFixed(1)}px`,
                  '--dy': `${particle.dy.toFixed(1)}px`,
                  '--size': `${particle.size.toFixed(1)}px`,
                  '--rot': `${particle.rotation.toFixed(0)}deg`,
                  '--delay': `${particle.delay.toFixed(0)}ms`,
                  '--dur': `${particle.duration.toFixed(0)}ms`,
                  '--color': particle.color,
                }"
              ></span>
            </template>
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
            :aria-label="operatorAriaLabel(op.label, op.shortSymbol, idx, false)"
            @mouseenter="hoveredOperatorLabel = op.label"
            @mouseleave="hoveredOperatorLabel = null"
            @focus="hoveredOperatorLabel = op.label"
            @blur="hoveredOperatorLabel = null"
            @click="handleApplyOperator(op.id)"
          >
            <span class="op-square__sym">{{ op.shortSymbol }}</span>
            <span v-if="opKeyLabel(idx)" class="op-key">{{ opKeyLabel(idx) }}</span>
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
            :aria-label="operatorAriaLabel(op.label, op.shortSymbol, idx, true)"
            @mouseenter="hoveredOperatorLabel = op.label"
            @mouseleave="hoveredOperatorLabel = null"
            @focus="hoveredOperatorLabel = op.label"
            @blur="hoveredOperatorLabel = null"
            @click="handleApplyOperator(op.id)"
          >
            <span class="op-square__sym">{{ op.shortSymbol }}</span>
            <span v-if="opKeyLabel(idx)" class="op-key">⇧{{ opKeyLabel(idx) }}</span>
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

/* Playing Screen: Balatro-ish table with left HUD rail, filling the viewport.
   The screen is locked to the viewport height so the board always takes the
   space that is left instead of pushing the page into a scroll. */
.screen-playing {
  flex: 1;
  display: flex;
  min-height: 0;
  height: 100vh;
  height: 100dvh;
  padding: 14px 20px 18px;
  max-width: 1520px;
  width: 100%;
  margin: 0 auto;
  overflow: hidden;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

/* The HUD outgrows a short window as soon as a famous-constant card (symbol,
   name and meaning) or a many-digit target is on the table. The score column
   then scrolls inside its own rail, so the workspace tabs and the round
   controls below it stay pinned in view instead of slipping below the fold. */
.table-sidebar :deep(.blind-sidebar) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #4a4368 transparent;
}

.table-sidebar :deep(.blind-sidebar)::-webkit-scrollbar {
  width: 6px;
}

.table-sidebar :deep(.blind-sidebar)::-webkit-scrollbar-track {
  background: transparent;
}

.table-sidebar :deep(.blind-sidebar)::-webkit-scrollbar-thumb {
  background: #4a4368;
}

/* Only the score rail gives up height; the controls keep their size. */
.table-sidebar > .sidebar-panel,
.table-sidebar > .sidebar-timer,
.table-sidebar > .sidebar-actions {
  flex: 0 0 auto;
}

.table-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Narrow screens: the HUD stacks over the felt as a compact two-column grid so
   its full height stays on screen. */
@media (max-width: 1000px) {
    .screen-playing {
      padding: 10px 12px 12px;
    }
    .table-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 8px;
    }
    .table-sidebar {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
      grid-template-areas:
        'score workspaces'
        'score actions'
        'timer timer';
      gap: 8px;
      align-items: start;
      /* Cap the strip so a tall constant card can never eat the felt; the
         remaining HUD content scrolls within the cap instead. */
      max-height: min(58dvh, 420px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: #4a4368 transparent;
    }
    .table-sidebar::-webkit-scrollbar {
      width: 6px;
    }
    .table-sidebar::-webkit-scrollbar-thumb {
      background: #4a4368;
    }
    :deep(.blind-sidebar) {
      grid-area: score;
      align-self: stretch;
    }
    .sidebar-panel {
      grid-area: workspaces;
    }
    .sidebar-actions {
      grid-area: actions;
      align-self: end;
    }
    .sidebar-timer {
      grid-area: timer;
    }
}

@media (max-width: 520px) {
    .table-sidebar {
      grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
    }
    .ws-tab-w {
      display: none;
    }
    .ws-tab-key {
      display: none;
    }
    .sidebar-actions .btn-arcade {
      padding: 7px 6px;
      font-size: 0.66rem;
    }
}

/* Short screens (laptops, phones in landscape): keep the HUD as a single strip
   across the top instead of a tall column. Phones in portrait stay on the
   stacked layout — their column is too narrow for three side-by-side blocks. */
@media (max-height: 560px) and (min-width: 520px) {
    .screen-playing {
      padding: 8px 10px 10px;
    }
    .table-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 8px;
    }
    .table-sidebar {
      display: grid;
      grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr) minmax(0, 0.9fr);
      grid-template-areas:
        'score workspaces actions'
        'score timer actions';
      gap: 8px;
      align-items: start;
      /* Landscapes keep most of the height for the felt. */
      max-height: min(50dvh, 320px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: #4a4368 transparent;
    }
    .table-sidebar::-webkit-scrollbar {
      width: 6px;
    }
    .table-sidebar::-webkit-scrollbar-thumb {
      background: #4a4368;
    }
    .sidebar-panel {
      align-self: stretch;
    }
    .sidebar-actions {
      align-self: stretch;
    }
    .sidebar-timer {
      grid-area: timer;
    }
    .sidebar-actions .btn-arcade {
      padding: 5px 8px;
      font-size: 0.64rem;
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

/* Workspace tabs: one compact row so the HUD never grows past a short screen */
.workspace-stack {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.ws-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  background: #1d1830;
  color: var(--ink-cream);
  border: 2px solid #3a3550;
  padding: 4px 2px;
  font-family: var(--font-pixel);
  text-align: center;
  cursor: pointer;
  transition: transform 0.1s steps(2), border-color 0.12s ease, background 0.12s ease;
}

.ws-tab:hover {
  border-color: var(--gold);
  transform: translateY(-2px);
}

.ws-tab--active {
  background: var(--gold);
  border-color: #fff9db;
  color: #15111e;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.28);
  transform: translateY(-2px);
}

.ws-tab-num {
  font-weight: 800;
  font-size: 0.76rem;
  line-height: 1.1;
}

.ws-tab-key {
  font-size: 0.5rem;
  line-height: 1;
  opacity: 0.55;
  border: 1px solid currentColor;
  padding: 0 2px;
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
  min-height: 0;
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

/* Particle bursts live above the cards and below the operator rail. Each span
   starts at its felt-local origin and flies outward with a little gravity. */
.particle-layer {
  position: absolute;
  inset: 0;
  z-index: 24;
  pointer-events: none;
  overflow: hidden;
}

.felt-particle {
  position: absolute;
  width: var(--size);
  height: var(--size);
  background: var(--color);
  box-shadow:
    0 0 8px var(--color),
    0 0 2px #fff8dc;
  image-rendering: pixelated;
  opacity: 0;
  animation: felt-particle-fly var(--dur) cubic-bezier(0.12, 0.9, 0.3, 1) var(--delay)
    forwards;
}

.felt-particle--spark {
  width: calc(var(--size) * 1.7);
  height: 2px;
}

.felt-particle--shard {
  width: 2px;
  height: calc(var(--size) * 1.5);
}

@keyframes felt-particle-fly {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0deg) scale(0.4);
  }
  10% {
    opacity: 1;
  }
  62% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), calc(var(--dy) + 24px)) rotate(var(--rot)) scale(0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .particle-layer {
    display: none;
  }
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
  /* Stacking order comes from the workspace (see getGroupStackRank), so the
     piece the player touched last always sits on top. */
  user-select: none;
  touch-action: none;
}

.draggable-group-slot--dragging {
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
  /* Leave room for the bottom-right board tools so the rail never hides them */
  max-height: calc(100% - 62px);
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

/* Short screens: tighten the sidebar's own spacing so its content fits the
   viewport column without ever spilling under the fold. */
@media (max-height: 700px) {
    .table-sidebar {
      gap: 7px;
    }
    .sidebar-panel {
      padding: 6px 8px 8px;
    }
    .sidebar-panel__title {
      margin-bottom: 4px;
    }
    .sidebar-actions {
      gap: 6px;
    }
    .sidebar-actions .btn-arcade {
      padding: 6px 10px;
    }
}

/* Very short landscape screens: scale the whole table down a notch. The felt
   still gets more real pixels than the strip layout alone would leave, and the
   cards fit without zooming into a single-pixel strip. */
@media (max-height: 440px) and (min-width: 520px) {
    .table-layout {
      zoom: 0.82;
    }
}

/* Narrow tabs and the shorter equation ribbon live here, after the base rules,
   so they are not overridden by the component's default sizes. */
@media (max-width: 520px) {
    .ws-tab {
      padding: 4px 1px;
    }
    .ws-tab-num {
      font-size: 0.62rem;
    }
}

@media (max-height: 560px) {
    .equation-ribbon {
      min-height: 36px;
      padding: 4px 10px;
    }
    .equation-ribbon__eq {
      font-size: 0.92rem;
    }
}

/* Very short screens: one more notch of sidebar spacing before the layout
   flips to the horizontal strip at 560px. */
@media (max-height: 620px) {
    .table-sidebar {
      gap: 6px;
    }
    .sidebar-panel {
      padding: 5px 8px 6px;
    }
    .sidebar-panel__title {
      margin-bottom: 3px;
    }
    .sidebar-actions .btn-arcade {
      padding: 5px 10px;
    }
}

/* Short boards: tighten the operator rail so all buttons stay reachable */
@media (max-height: 700px) {
    .op-rail {
      gap: 5px;
      padding: 5px 4px;
    }
    .op-rail__group {
      gap: 3px;
    }
    .op-square {
      width: 36px;
      height: 36px;
    }
    .op-square__sym {
      font-size: 0.88rem;
    }
}

/* Board overlays shrink with the screen; kept last so they beat the base sizes */
@media (max-width: 1000px) {
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
