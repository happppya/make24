<script setup lang="ts">
import { computed } from 'vue'
import { useGameContext } from '../app/context'
import { formatNumber } from '../engine/math'
import { PUZZLE_KIND_LABELS, type PuzzleDefinition } from '../engine/puzzles'
import DifficultyChip from './DifficultyChip.vue'

const props = withDefaults(
  defineProps<{
    puzzle: PuzzleDefinition
    /** Cadence tag, e.g. HOURLY / DAILY I / WEEKLY. */
    label: string
    testId: string
    playTestId: string
    actionLabel: string
    tone?: 'default' | 'hourly' | 'weekly'
  }>(),
  { tone: 'default' }
)

const emit = defineEmits<{ play: [] }>()

const { boardState, resetLabel, topThree, yourBest } = useGameContext()

const top = computed(() => topThree(props.puzzle))
const best = computed(() => yourBest(props.puzzle))
const kindLabel = computed(() => PUZZLE_KIND_LABELS[props.puzzle.kind])

function statusLabel(): string {
  switch (boardState(props.puzzle)) {
    case 'loading':
      return 'Reading board…'
    case 'online':
      return 'Shared board'
    case 'local':
      return 'This device'
    default:
      return 'No board yet'
  }
}

function rankLabel(index: number): string {
  return index === 0 ? '★' : String(index + 1)
}
</script>

<template>
  <article
    class="puzzle-card"
    :class="[`puzzle-card--${tone}`]"
    :data-testid="testId"
    :style="{ '--card-accent': tone === 'weekly' ? 'var(--crimson)' : 'var(--gold)' }"
  >
    <div class="puzzle-card__top">
      <div class="puzzle-card__tags-row">
        <span class="puzzle-card__badge">{{ label }}</span>
        <DifficultyChip :difficulty="puzzle.difficulty" compact />
      </div>
      <span class="puzzle-card__reset">{{ resetLabel(puzzle) }}</span>
    </div>

    <div>
      <h2>{{ puzzle.name }}</h2>
      <p class="puzzle-card__key">{{ kindLabel }} · {{ puzzle.key }}</p>
    </div>

    <div class="puzzle-card__stats">
      <div>
        <span>Target</span>
        <strong>{{ formatNumber(puzzle.target) }}</strong>
      </div>
      <div>
        <span>Cards</span>
        <strong>{{ puzzle.settings.numCards }}</strong>
      </div>
    </div>

    <p class="puzzle-card__note">{{ puzzle.difficultyNote }}</p>

    <div class="puzzle-card__tags" aria-label="Allowed operator groups">
      <span v-for="groupLabel in puzzle.operatorGroupLabels" :key="groupLabel">
        {{ groupLabel }}
      </span>
    </div>
    <div
      v-if="puzzle.bindLabels.length"
      class="puzzle-card__tags puzzle-card__tags--binds"
      aria-label="Opening binds"
    >
      <span class="puzzle-card__tags-title">BINDS</span>
      <span v-for="bindLabel in puzzle.bindLabels" :key="bindLabel">{{ bindLabel }}</span>
    </div>

    <div class="puzzle-board-head">
      <h3>Top 3 scores</h3>
      <span>{{ statusLabel() }}</span>
    </div>
    <ol v-if="top.length" class="puzzle-board">
      <li v-for="(row, index) in top" :key="`${row.playerName}-${row.submittedAt}`">
        <span class="puzzle-board__rank">{{ rankLabel(index) }}</span>
        <span class="puzzle-board__name">{{ row.playerName }}</span>
        <strong>{{ formatNumber(row.score) }}</strong>
      </li>
    </ol>
    <p v-else class="puzzle-board__empty">No score yet. Set the pace.</p>

    <p v-if="best !== null" class="puzzle-card__best">
      Your best: <strong>{{ formatNumber(best) }}</strong>
    </p>

    <button
      type="button"
      class="btn-arcade btn-arcade--block"
      :class="tone === 'weekly' ? 'btn-arcade--crimson' : 'btn-arcade--gold'"
      :data-testid="playTestId"
      @click="emit('play')"
    >
      {{ actionLabel }}
    </button>
  </article>
</template>

<style scoped>
.puzzle-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
  background: linear-gradient(180deg, #211a30 0%, #120f1c 100%);
  border: 4px solid #3c3357;
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 40px rgba(255, 255, 255, 0.03),
    0 10px 0 #09080f;
  padding: 16px 16px 18px;
}

.puzzle-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 5px;
  background: var(--card-accent);
}

.puzzle-card--hourly {
  border-color: #2f5148;
}

.puzzle-card--hourly::before {
  background: #72efdd;
}

.puzzle-card--weekly {
  border-color: #5b2d3d;
}

.puzzle-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.puzzle-card__tags-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.puzzle-card__badge {
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.12em;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.5);
  color: var(--gold-bright);
  padding: 4px 7px;
}

.puzzle-card--weekly .puzzle-card__badge {
  border-color: rgba(254, 74, 73, 0.55);
  color: #ff9daa;
}

.puzzle-card__reset {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--ink-muted);
}

.puzzle-card h2 {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: 1.02rem;
  line-height: 1.3;
  color: var(--gold-bright);
}

.puzzle-card--hourly h2 {
  color: #b8fff4;
}

.puzzle-card--weekly h2 {
  color: #ffb3bd;
}

.puzzle-card__key {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.84rem;
  color: rgba(247, 240, 224, 0.42);
}

.puzzle-card__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.puzzle-card__stats > div {
  min-width: 0;
  background: #0e0c15;
  border: 1px solid rgba(242, 201, 76, 0.22);
  padding: 7px 9px;
}

.puzzle-card__stats span {
  display: block;
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.puzzle-card__stats strong {
  display: block;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 1.2rem;
  font-weight: 400;
  line-height: 1;
  color: #fff;
  overflow-wrap: anywhere;
}

.puzzle-card__note {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.94rem;
  line-height: 1.32;
  color: rgba(247, 240, 224, 0.72);
}

.puzzle-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.puzzle-card__tags span {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #72efdd;
  border: 1px solid rgba(114, 239, 221, 0.28);
  background: rgba(114, 239, 221, 0.06);
  padding: 2px 6px;
}

.puzzle-card--weekly .puzzle-card__tags span {
  color: #ffc2ca;
  border-color: rgba(255, 143, 163, 0.28);
  background: rgba(254, 74, 73, 0.06);
}

.puzzle-card__tags--binds span {
  color: #b8f5c8;
  border-color: rgba(111, 214, 138, 0.34);
  background: rgba(111, 214, 138, 0.08);
}

.puzzle-card__tags--binds .puzzle-card__tags-title {
  color: #6fd68a;
  border-color: transparent;
  background: transparent;
  padding-left: 0;
  font-family: var(--font-pixel);
  font-size: 0.44rem;
  letter-spacing: 0.1em;
}

.puzzle-board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  border-top: 2px dashed rgba(242, 201, 76, 0.2);
  padding-top: 9px;
}

.puzzle-board-head h3 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold);
}

.puzzle-board-head > span {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.puzzle-board {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.puzzle-board li {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  align-items: center;
  gap: 7px;
  background: #100d18;
  border: 1px solid rgba(242, 201, 76, 0.18);
  padding: 4px 7px;
  font-family: var(--font-mono);
  font-size: 0.96rem;
}

.puzzle-board__rank {
  color: var(--gold);
  text-align: center;
}

.puzzle-board__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puzzle-board strong {
  color: #fff;
}

.puzzle-board__empty {
  margin: 0;
  padding: 10px 8px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--ink-muted);
  border: 1px dashed rgba(242, 201, 76, 0.22);
}

.puzzle-card__best {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: #72efdd;
}

.puzzle-card .btn-arcade {
  margin-top: 2px;
}
</style>
