<script setup lang="ts">
import { computed } from 'vue'
import SolutionBoard from '../SolutionBoard.vue'
import { useGameContext } from '../../app/context'
import { gauntletById, nextTrialIn } from '../../engine/dungeon'
import { formatNumber } from '../../engine/math'
import { PUZZLE_KIND_LABELS, puzzleDifficultyMeta } from '../../engine/puzzles'

const {
  menuOpen,
  tutorialOpen,
  lastResult,
  puzzlePlayerName,
  boardState,
  topThree,
  retryPuzzle,
  exitPuzzleToHub,
  nextDungeonTrial,
  gauntletProgress,
  gauntletComplete,
  nextGauntletId,
  openGauntlet,
  openDungeon,
} = useGameContext()

const top = computed(() => (lastResult.value ? topThree(lastResult.value.puzzle) : []))
const revealed = computed(() => Boolean(lastResult.value?.revealed))
const dungeon = computed(() => lastResult.value?.dungeon ?? null)
const gauntlet = computed(() =>
  dungeon.value ? gauntletById(dungeon.value.gauntletId) ?? null : null
)
const clearedCount = computed(() =>
  gauntlet.value ? gauntletProgress(gauntlet.value) : 0
)
const gauntletDone = computed(() =>
  gauntlet.value ? gauntletComplete(gauntlet.value) : false
)
const nextTrial = computed(() =>
  dungeon.value ? nextTrialIn(dungeon.value.gauntletId, dungeon.value.trialId) : null
)
const nextTrialTitle = computed(() => nextTrial.value?.title ?? '')
const nextGauntlet = computed(() => {
  const id = gauntlet.value ? nextGauntletId(gauntlet.value.id) : null
  return id ? gauntletById(id) ?? null : null
})
const nextGauntletName = computed(() => nextGauntlet.value?.name ?? '')

function enterNextGauntlet(): void {
  const next = nextGauntlet.value
  if (next) openGauntlet(next.id)
}

const kindLabel = computed(() => {
  const result = lastResult.value
  if (!result) return ''
  if (result.dungeon) {
    return `DUNGEON · ${puzzleDifficultyMeta(result.puzzle.difficulty).label}`
  }
  return `${PUZZLE_KIND_LABELS[result.puzzle.kind]} · ${puzzleDifficultyMeta(result.puzzle.difficulty).label}`
})
const metaLabel = computed(() => {
  const result = lastResult.value
  if (!result) return ''
  if (result.puzzle.dungeon) {
    return `TRIAL ${result.puzzle.dungeon.trialNumber} / ${result.puzzle.dungeon.trialCount}`
  }
  return result.puzzle.key
})
const statusLabel = computed(() => {
  if (!lastResult.value) return ''
  if (lastResult.value.dungeon) return 'Campaign ledger'
  return boardState(lastResult.value.puzzle) === 'online'
    ? 'Shared board'
    : 'Saved on this device'
})
</script>

<template>
<main v-if="lastResult" class="screen-puzzle-result" :inert="menuOpen || tutorialOpen">
  <div
    class="puzzle-result-cabinet"
    :class="`puzzle-result-cabinet--${dungeon ? 'dungeon' : lastResult.puzzle.kind}`"
  >
    <div class="puzzle-result-marquee">
      <span>{{ kindLabel }}</span>
      <span>{{ metaLabel }}</span>
    </div>

    <div
      class="puzzle-result-stamp"
      :class="{ 'puzzle-result-stamp--local': lastResult.source === 'local' }"
      data-testid="puzzle-result-stamp"
    >
      {{
        revealed
          ? 'SOLUTION REVEALED'
          : dungeon
            ? 'TRIAL CLEARED'
            : lastResult.improved
              ? 'BEST LOGGED'
              : 'BOARD LOGGED'
      }}
    </div>

    <p v-if="gauntlet" class="puzzle-result-gauntlet">{{ gauntlet.name }}</p>
    <h1>{{ lastResult.puzzle.name }}</h1>
    <p class="puzzle-result-score">
      <span>{{ formatNumber(lastResult.score) }}</span>
      <small>{{ revealed ? 'reference score' : 'points' }}</small>
    </p>
    <p class="puzzle-result-equation">{{ lastResult.equation }}</p>

    <div class="puzzle-result-meta">
      <div>
        <span>Target</span>
        <strong>{{ formatNumber(lastResult.puzzle.targetExact ?? lastResult.puzzle.target) }}</strong>
      </div>
      <div>
        <span>Your ledger</span>
        <strong>{{ puzzlePlayerName || 'Anonymous' }}</strong>
      </div>
      <div>
        <span>Rank</span>
        <strong>{{ lastResult.rank ? `#${lastResult.rank}` : '—' }}</strong>
      </div>
      <div>
        <span>Board</span>
        <strong>{{ statusLabel }}</strong>
      </div>
    </div>

    <section v-if="revealed" class="puzzle-result-board" data-testid="revealed-solution">
      <div class="puzzle-result-board__head">
        <h2>Reference solution</h2>
        <span>Every card, one route to the target</span>
      </div>
      <SolutionBoard :node="lastResult.puzzle.referenceSolution" />
    </section>

    <p v-if="revealed" class="puzzle-result-note" role="status">
      You gave up on this trial. It counts as cleared and the next one is open, but
      it adds no best score.
    </p>

    <section v-if="dungeon && gauntlet" class="puzzle-result-board" data-testid="dungeon-result-progress">
      <div class="puzzle-result-board__head">
        <h2>Gauntlet progress</h2>
        <span>{{ clearedCount }} / {{ gauntlet.trials.length }} cleared</span>
      </div>
      <div class="puzzle-result-progress">
        <span
          :style="{ width: `${Math.round((clearedCount / gauntlet.trials.length) * 100)}%` }"
        ></span>
      </div>
      <p class="puzzle-result-progress__note">
        <template v-if="gauntletDone && nextGauntlet">
          Every trial is cleared. {{ nextGauntletName }} is open.
        </template>
        <template v-else-if="gauntletDone">
          The final gauntlet is cleared. There is nothing left below this floor.
        </template>
        <template v-else-if="nextTrial">
          Next up: {{ nextTrialTitle }}.
        </template>
      </p>
    </section>

    <p v-if="lastResult.note" class="puzzle-result-note" role="status">
      {{ lastResult.note }}
    </p>

    <section v-if="!dungeon" class="puzzle-result-board">
      <div class="puzzle-result-board__head">
        <h2>Top 3 scores</h2>
        <span>{{ PUZZLE_KIND_LABELS[lastResult.puzzle.kind] }} board</span>
      </div>
      <ol v-if="top.length">
        <li v-for="(row, index) in top" :key="`${row.playerName}-${row.submittedAt}`">
          <span class="puzzle-result-board__rank">{{ index === 0 ? '★' : index + 1 }}</span>
          <span class="puzzle-result-board__name">{{ row.playerName }}</span>
          <span class="puzzle-result-board__eq">{{ row.equation }}</span>
          <strong>{{ formatNumber(row.score) }}</strong>
        </li>
      </ol>
      <p v-else class="puzzle-result-board__empty">
        The board is still empty. Your score is waiting for a challenger.
      </p>
    </section>

    <div v-if="dungeon" class="puzzle-result-actions">
      <button
        v-if="nextTrial && !gauntletDone"
        type="button"
        class="btn-arcade btn-arcade--gold"
        data-testid="next-trial-btn"
        @click="nextDungeonTrial"
      >
        Next Trial: {{ nextTrialTitle }}
      </button>
      <button
        v-else-if="gauntletDone && nextGauntlet"
        type="button"
        class="btn-arcade btn-arcade--gold"
        data-testid="next-gauntlet-btn"
        @click="enterNextGauntlet"
      >
        Enter {{ nextGauntletName }}
      </button>
      <button
        v-else
        type="button"
        class="btn-arcade btn-arcade--gold"
        data-testid="dungeon-map-btn"
        @click="openDungeon"
      >
        Return to the Dungeon
      </button>
      <button type="button" class="btn-arcade" data-testid="retry-puzzle-btn" @click="retryPuzzle">
        Retry Trial
      </button>
      <button type="button" class="btn-arcade" data-testid="back-to-gauntlet-btn" @click="exitPuzzleToHub">
        Back to Gauntlet
      </button>
    </div>

    <div v-else class="puzzle-result-actions">
      <button type="button" class="btn-arcade btn-arcade--gold" data-testid="retry-puzzle-btn" @click="retryPuzzle">
        Try Again
      </button>
      <button type="button" class="btn-arcade" data-testid="back-to-puzzles-btn" @click="exitPuzzleToHub">
        Back to Puzzles
      </button>
    </div>
  </div>
</main>
</template>

<style scoped>
.screen-puzzle-result {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px 20px 40px;
}

.puzzle-result-cabinet {
  width: min(820px, 100%);
  background: linear-gradient(180deg, #221a34 0%, #120f1c 70%);
  border: 5px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow: inset 0 0 60px rgba(255, 190, 11, 0.08), 0 12px 0 #09080f;
  padding: 20px 22px 22px;
  animation: balatro-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.puzzle-result-cabinet--weekly {
  border-color: var(--crimson);
  box-shadow: inset 0 0 60px rgba(254, 74, 73, 0.08), 0 12px 0 #09080f;
}

.puzzle-result-cabinet--dungeon {
  border-color: #c77dff;
  box-shadow: inset 0 0 60px rgba(199, 125, 255, 0.1), 0 12px 0 #09080f;
}

.puzzle-result-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.5);
  padding: 6px 10px;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  color: var(--gold);
}

.puzzle-result-cabinet--weekly .puzzle-result-marquee {
  border-color: rgba(254, 74, 73, 0.5);
  color: #ff9daa;
}

.puzzle-result-cabinet--dungeon .puzzle-result-marquee {
  border-color: rgba(199, 125, 255, 0.55);
  color: #e0c2ff;
}

.puzzle-result-stamp {
  display: inline-block;
  margin: 20px 0 6px;
  padding: 9px 16px 7px;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1;
  background: var(--gold);
  border: 4px solid #fff9db;
  outline: 4px solid #09080f;
  box-shadow: 0 8px 0 #09080f;
  transform: rotate(-4deg);
  animation: stamp-drop 0.45s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.puzzle-result-stamp--local {
  background: #2a2338;
  border-color: #72efdd;
  color: #d8fffa;
}

.puzzle-result-cabinet h1 {
  margin: 10px 0 16px;
  font-family: var(--font-display);
  font-size: clamp(1rem, 2.6vw, 1.45rem);
  line-height: 1.35;
  color: var(--ink-cream);
}

.puzzle-result-score {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}

.puzzle-result-score > span {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 9vw, 4.6rem);
  line-height: 1;
  color: var(--gold-bright);
  text-shadow: 0 5px 0 #b06b00, 0 9px 0 #09080f;
}

.puzzle-result-cabinet--weekly .puzzle-result-score > span {
  color: #ffb3bd;
  text-shadow: 0 5px 0 #7a1212, 0 9px 0 #09080f;
}

.puzzle-result-cabinet--dungeon .puzzle-result-score > span {
  color: #e8c8ff;
  text-shadow: 0 5px 0 #5a2b7a, 0 9px 0 #09080f;
}

.puzzle-result-gauntlet {
  margin: 0 0 2px;
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.16em;
  color: #c77dff;
}

.puzzle-result-score small {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--ink-muted);
}

.puzzle-result-equation {
  margin: 16px 0 18px;
  padding: 10px 12px;
  background: #0f0c17;
  border: 2px solid rgba(242, 201, 76, 0.28);
  font-family: var(--font-mono);
  font-size: clamp(1rem, 2.4vw, 1.25rem);
  line-height: 1.35;
  color: #fff;
  overflow-wrap: anywhere;
}

.puzzle-result-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}

.puzzle-result-meta > div {
  background: #120f18;
  border: 1px solid rgba(242, 201, 76, 0.22);
  padding: 8px 10px;
}

.puzzle-result-meta span {
  display: block;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.puzzle-result-meta strong {
  display: block;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 400;
  color: var(--ink-cream);
  overflow-wrap: anywhere;
}

.puzzle-result-note {
  margin: 0 0 18px;
  padding: 8px 10px;
  border-left: 3px solid #72efdd;
  background: rgba(114, 239, 221, 0.08);
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.3;
  color: #d8fffa;
}

.puzzle-result-board {
  margin-bottom: 20px;
}

.puzzle-result-board__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.puzzle-result-board__head h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gold);
}

.puzzle-result-board__head span {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--ink-muted);
}

.puzzle-result-board ol {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.puzzle-result-board li {
  display: grid;
  grid-template-columns: 26px 120px 1fr auto;
  align-items: center;
  gap: 10px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.3);
  padding: 7px 10px;
  font-family: var(--font-mono);
  font-size: 0.96rem;
}

.puzzle-result-board__rank {
  color: var(--gold);
  text-align: center;
}

.puzzle-result-board__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puzzle-result-board__eq {
  color: var(--ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puzzle-result-board li strong {
  color: #fff;
}

.puzzle-result-board__empty {
  margin: 0;
  padding: 14px;
  text-align: center;
  border: 1px dashed rgba(242, 201, 76, 0.25);
  color: var(--ink-muted);
  font-family: var(--font-mono);
}

.puzzle-result-progress {
  height: 12px;
  background: #09080f;
  border: 2px solid #2a2438;
  overflow: hidden;
}

.puzzle-result-progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #5a2b7a, #c77dff);
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.puzzle-result-progress__note {
  margin: 8px 0 0;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  color: var(--ink-muted);
}

.puzzle-result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.puzzle-result-actions .btn-arcade {
  flex: 1 1 180px;
}

@keyframes stamp-drop {
  0% {
    opacity: 0;
    transform: scale(2.1) rotate(-14deg);
  }
  70% {
    opacity: 1;
    transform: scale(0.94) rotate(-3deg);
  }
  100% {
    transform: scale(1) rotate(-4deg);
  }
}

@media (max-width: 640px) {
  .puzzle-result-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .puzzle-result-board li {
    grid-template-columns: 24px 1fr auto;
  }
  .puzzle-result-board__eq {
    display: none;
  }
}
</style>
