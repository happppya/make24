<script setup lang="ts">
import DifficultyChip from '../DifficultyChip.vue'
import PuzzleCadenceCard from '../PuzzleCadenceCard.vue'
import { useGameContext } from '../../app/context'
import { PUZZLE_DIFFICULTIES } from '../../engine/puzzles'

const {
  menuOpen,
  tutorialOpen,
  hourlyPuzzle,
  dailyPuzzle,
  secondDailyPuzzle,
  weeklyPuzzle,
  puzzlePlayerName,
  startPuzzle,
  goToTitle,
} = useGameContext()
</script>

<template>
  <main class="screen-puzzles" :inert="menuOpen || tutorialOpen">
    <div class="puzzle-marquee">
      <div class="puzzle-marquee__left">
        <span class="puzzle-marquee__badge">PUZZLES</span>
        <span class="puzzle-marquee__name">The Puzzle Board</span>
      </div>
      <button
        type="button"
        class="btn-arcade btn-arcade--tiny"
        data-testid="puzzles-back-btn"
        @click="goToTitle"
      >
        ◂ Main Menu
      </button>
    </div>

    <section class="puzzle-intro">
      <div>
        <h1>Four clocks.<br /><span>One shared board each.</span></h1>
        <p>
          A new hand every hour, two fresh deals each day, and one long trial each
          week. Every player gets the same cards and the same target. Use every
          card, finish one expression, and climb the board with the lowest score.
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
      <PuzzleCadenceCard
        :puzzle="hourlyPuzzle"
        label="HOURLY"
        test-id="puzzle-hourly-card"
        play-test-id="play-hourly-puzzle"
        action-label="Play the Hour"
        tone="hourly"
        @play="startPuzzle('hourly')"
      />
      <PuzzleCadenceCard
        :puzzle="dailyPuzzle"
        label="DAILY I"
        test-id="puzzle-daily-card"
        play-test-id="play-daily-puzzle"
        action-label="Play Daily I"
        @play="startPuzzle('daily')"
      />
      <PuzzleCadenceCard
        :puzzle="secondDailyPuzzle"
        label="DAILY II"
        test-id="puzzle-daily-2-card"
        play-test-id="play-daily-2-puzzle"
        action-label="Play Daily II"
        @play="startPuzzle('daily-2')"
      />
      <PuzzleCadenceCard
        :puzzle="weeklyPuzzle"
        label="WEEKLY"
        test-id="puzzle-weekly-card"
        play-test-id="play-weekly-puzzle"
        action-label="Enter the Weekly"
        tone="weekly"
        @play="startPuzzle('weekly')"
      />
    </div>

    <section class="puzzle-ladder" aria-label="Puzzle difficulty ladder">
      <div class="puzzle-ladder__head">
        <h2>The ladder</h2>
        <span>Hourly and daily boards live on the easy rungs. The weekly trial lives near the top.</span>
      </div>
      <div class="puzzle-ladder__chips">
        <DifficultyChip
          v-for="difficulty in PUZZLE_DIFFICULTIES"
          :key="difficulty.id"
          :difficulty="difficulty.id"
          compact
        />
      </div>
    </section>

    <p class="puzzle-footnote">
      Scores are submitted only when you finish a board with every dealt card. The
      lowest score wins; ties go to the earlier submission. Looking for more?
      <strong>The Dungeon</strong> runs seven themed gauntlets from the main menu.
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
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.14),
    0 8px 0 #09080f;
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
  font-size: clamp(1.2rem, 2.8vw, 2rem);
  line-height: 1.35;
  color: var(--ink-cream);
  text-shadow: 0 4px 0 #09080f;
}

.puzzle-intro h1 span {
  color: var(--gold-bright);
}

.puzzle-intro p {
  max-width: 64ch;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.02rem;
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
  font-size: 0.86rem;
  color: var(--ink-muted);
}

.puzzle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.puzzle-ladder {
  margin-top: 24px;
  padding: 12px 14px;
  background: rgba(17, 14, 26, 0.72);
  border: 2px solid rgba(255, 190, 11, 0.28);
}

.puzzle-ladder__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 9px;
}

.puzzle-ladder__head h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gold);
}

.puzzle-ladder__head span {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--ink-muted);
}

.puzzle-ladder__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.puzzle-footnote {
  margin: 18px 0 0;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.4;
  color: rgba(247, 240, 224, 0.45);
}

.puzzle-footnote strong {
  color: var(--gold-bright);
  font-weight: 400;
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
}
</style>
