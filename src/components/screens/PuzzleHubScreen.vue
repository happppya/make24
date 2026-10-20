<script setup lang="ts">
import { computed } from 'vue'
import { useGameContext } from '../../app/context'
import { formatNumber } from '../../engine/math'
import type { PuzzleDefinition } from '../../engine/puzzles'

const {
  menuOpen,
  tutorialOpen,
  dailyPuzzle,
  weeklyPuzzle,
  puzzlePlayerName,
  boardState,
  resetLabel,
  startPuzzle,
  topThree,
  yourBest,
  goToTitle,
} = useGameContext()

const dailyTop = computed(() => topThree(dailyPuzzle.value))
const weeklyTop = computed(() => topThree(weeklyPuzzle.value))
const dailyBest = computed(() => yourBest(dailyPuzzle.value))
const weeklyBest = computed(() => yourBest(weeklyPuzzle.value))

function statusLabel(puzzle: PuzzleDefinition): string {
  switch (boardState(puzzle)) {
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
<main class="screen-puzzles" :inert="menuOpen || tutorialOpen">
  <div class="puzzle-marquee">
    <div class="puzzle-marquee__left">
      <span class="puzzle-marquee__badge">DAILY / WEEKLY</span>
      <span class="puzzle-marquee__name">The Puzzle Board</span>
    </div>
    <button type="button" class="btn-arcade btn-arcade--tiny" data-testid="puzzles-back-btn" @click="goToTitle">
      ◂ Main Menu
    </button>
  </div>

  <section class="puzzle-intro">
    <div>
      <h1>One board a day.<br /><span>One trial a week.</span></h1>
      <p>
        No clock, no house rules to tune. Every player gets the same hand and the same
        target. Use every card, finish one expression, and climb the board with the
        lowest score.
      </p>
    </div>
    <label class="puzzle-name">
      <span>Leaderboard name</span>
      <input
        v-model="puzzlePlayerName"
        type="text"
        class="input-arcade"
        maxlength="24"
        data-testid="puzzle-name-input"
      />
      <small>Used when a new best is submitted.</small>
    </label>
  </section>

  <div class="puzzle-grid">
    <article class="puzzle-card puzzle-card--daily" data-testid="puzzle-daily-card">
      <div class="puzzle-card__top">
        <span class="puzzle-card__badge">DAILY · MEDIUM</span>
        <span class="puzzle-card__reset">{{ resetLabel(dailyPuzzle) }}</span>
      </div>
      <h2>{{ dailyPuzzle.name }}</h2>
      <p class="puzzle-card__key">{{ dailyPuzzle.key }}</p>

      <div class="puzzle-card__stats">
        <div>
          <span>Target</span>
          <strong>{{ formatNumber(dailyPuzzle.target) }}</strong>
        </div>
        <div>
          <span>Cards</span>
          <strong>{{ dailyPuzzle.settings.numCards }}</strong>
        </div>
      </div>

      <p class="puzzle-card__note">{{ dailyPuzzle.difficultyNote }}</p>
      <div class="puzzle-card__tags" aria-label="Allowed operator groups">
        <span v-for="label in dailyPuzzle.operatorGroupLabels" :key="label">{{ label }}</span>
      </div>

      <div class="puzzle-board-head">
        <h3>Top 3 scores</h3>
        <span>{{ statusLabel(dailyPuzzle) }}</span>
      </div>
      <ol v-if="dailyTop.length" class="puzzle-board">
        <li v-for="(row, index) in dailyTop" :key="`${row.playerName}-${row.submittedAt}`">
          <span class="puzzle-board__rank">{{ rankLabel(index) }}</span>
          <span class="puzzle-board__name">{{ row.playerName }}</span>
          <strong>{{ formatNumber(row.score) }}</strong>
        </li>
      </ol>
      <p v-else class="puzzle-board__empty">No score yet. Set the pace.</p>

      <p v-if="dailyBest !== null" class="puzzle-card__best" data-testid="daily-personal-best">
        Your best: <strong>{{ formatNumber(dailyBest) }}</strong>
      </p>
      <button
        type="button"
        class="btn-arcade btn-arcade--gold btn-arcade--block"
        data-testid="play-daily-puzzle"
        @click="startPuzzle('daily')"
      >
        Play Daily Puzzle
      </button>
    </article>

    <article class="puzzle-card puzzle-card--weekly" data-testid="puzzle-weekly-card">
      <div class="puzzle-card__top">
        <span class="puzzle-card__badge">WEEKLY · EXTREME</span>
        <span class="puzzle-card__reset">{{ resetLabel(weeklyPuzzle) }}</span>
      </div>
      <h2>{{ weeklyPuzzle.name }}</h2>
      <p class="puzzle-card__key">{{ weeklyPuzzle.key }}</p>

      <div class="puzzle-card__stats">
        <div>
          <span>Target</span>
          <strong>{{ formatNumber(weeklyPuzzle.target) }}</strong>
        </div>
        <div>
          <span>Cards</span>
          <strong>{{ weeklyPuzzle.settings.numCards }}</strong>
        </div>
      </div>

      <p class="puzzle-card__note">{{ weeklyPuzzle.difficultyNote }}</p>
      <div class="puzzle-card__tags" aria-label="Allowed operator groups">
        <span v-for="label in weeklyPuzzle.operatorGroupLabels" :key="label">{{ label }}</span>
      </div>

      <div class="puzzle-board-head">
        <h3>Top 3 scores</h3>
        <span>{{ statusLabel(weeklyPuzzle) }}</span>
      </div>
      <ol v-if="weeklyTop.length" class="puzzle-board">
        <li v-for="(row, index) in weeklyTop" :key="`${row.playerName}-${row.submittedAt}`">
          <span class="puzzle-board__rank">{{ rankLabel(index) }}</span>
          <span class="puzzle-board__name">{{ row.playerName }}</span>
          <strong>{{ formatNumber(row.score) }}</strong>
        </li>
      </ol>
      <p v-else class="puzzle-board__empty">No score yet. The deep end is open.</p>

      <p v-if="weeklyBest !== null" class="puzzle-card__best" data-testid="weekly-personal-best">
        Your best: <strong>{{ formatNumber(weeklyBest) }}</strong>
      </p>
      <button
        type="button"
        class="btn-arcade btn-arcade--crimson btn-arcade--block"
        data-testid="play-weekly-puzzle"
        @click="startPuzzle('weekly')"
      >
        Enter the Weekly
      </button>
    </article>
  </div>

  <p class="puzzle-footnote">
    Scores are submitted only when you finish a board with every dealt card. The
    lowest score wins; ties go to the earlier submission.
  </p>
</main>
</template>

<style scoped>
.screen-puzzles {
  flex: 1;
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 18px 20px 40px;
}

.puzzle-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  background: linear-gradient(180deg, #241a34, #171226);
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.14), 0 8px 0 #09080f;
  padding: 10px 14px;
  margin-bottom: 18px;
}

.puzzle-marquee__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.puzzle-marquee__badge {
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  background: #0b0912;
  color: var(--gold);
  border: 2px solid rgba(255, 190, 11, 0.55);
  padding: 4px 8px;
}

.puzzle-marquee__name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f;
}

.puzzle-intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 24px;
  align-items: end;
  padding: 12px 4px 22px;
}

.puzzle-intro h1 {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 3vw, 2.1rem);
  line-height: 1.35;
  color: var(--ink-cream);
  text-shadow: 0 4px 0 #09080f;
}

.puzzle-intro h1 span {
  color: var(--gold-bright);
}

.puzzle-intro p {
  max-width: 62ch;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.05rem;
  line-height: 1.35;
  color: var(--ink-muted);
}

.puzzle-name {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #13111c;
  border: 3px solid #3a3550;
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 10px 12px;
}

.puzzle-name > span {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}

.puzzle-name small {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--ink-muted);
}

.puzzle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.puzzle-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(180deg, #211a30 0%, #120f1c 100%);
  border: 4px solid #3c3357;
  outline: 4px solid #09080f;
  box-shadow: inset 0 0 40px rgba(255, 255, 255, 0.03), 0 10px 0 #09080f;
  padding: 18px;
}

.puzzle-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 5px;
  background: var(--gold);
}

.puzzle-card--weekly {
  border-color: #5b2d3d;
}

.puzzle-card--weekly::before {
  background: var(--crimson);
}

.puzzle-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.puzzle-card__badge {
  font-family: var(--font-pixel);
  font-size: 0.58rem;
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
  font-size: 0.92rem;
  color: var(--ink-muted);
}

.puzzle-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  line-height: 1.3;
  color: var(--gold-bright);
}

.puzzle-card--weekly h2 {
  color: #ffb3bd;
}

.puzzle-card__key {
  margin: -6px 0 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: rgba(247, 240, 224, 0.4);
}

.puzzle-card__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.puzzle-card__stats > div {
  background: #0e0c15;
  border: 1px solid rgba(242, 201, 76, 0.22);
  padding: 8px 10px;
}

.puzzle-card__stats span {
  display: block;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.puzzle-card__stats strong {
  display: block;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 1.3rem;
  line-height: 1;
  color: #fff;
  overflow-wrap: anywhere;
}

.puzzle-card__note {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.98rem;
  line-height: 1.3;
  color: rgba(247, 240, 224, 0.72);
}

.puzzle-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.puzzle-card__tags span {
  font-family: var(--font-mono);
  font-size: 0.8rem;
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

.puzzle-board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
  border-top: 2px dashed rgba(242, 201, 76, 0.2);
  padding-top: 10px;
}

.puzzle-board-head h3 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}

.puzzle-board-head > span {
  font-family: var(--font-mono);
  font-size: 0.86rem;
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
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 8px;
  background: #100d18;
  border: 1px solid rgba(242, 201, 76, 0.18);
  padding: 5px 8px;
  font-family: var(--font-mono);
  font-size: 1.02rem;
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
  padding: 12px 8px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--ink-muted);
  border: 1px dashed rgba(242, 201, 76, 0.22);
}

.puzzle-card__best {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  color: #72efdd;
}

.puzzle-card .btn-arcade {
  margin-top: auto;
}

.puzzle-footnote {
  margin: 20px 0 0;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.35;
  color: rgba(247, 240, 224, 0.4);
}

@media (max-width: 900px) {
  .puzzle-intro {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .puzzle-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .screen-puzzles {
    padding: 12px 12px 30px;
  }
  .puzzle-intro h1 {
    font-size: 1.1rem;
  }
  .puzzle-card {
    padding: 14px;
  }
}
</style>
