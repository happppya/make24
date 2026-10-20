<script setup lang="ts">
import { useGameContext } from '../../app/context'
import { formatNumber } from '../../engine/math'

const {
  activePuzzle,
  activeTopThree,
  activeStatus,
  missingCards,
  canSubmit,
  puzzleSubmitError,
  submitting,
} = useGameContext()
</script>

<template>
  <section v-if="activePuzzle" class="puzzle-play-header" data-testid="puzzle-play-header">
    <div class="puzzle-play-header__identity">
      <span class="puzzle-play-header__badge">
        {{ activePuzzle.kind === 'daily' ? 'DAILY · MEDIUM' : 'WEEKLY · EXTREME' }}
      </span>
      <div>
        <strong>{{ activePuzzle.name }}</strong>
        <span class="puzzle-play-header__sub">
          {{ activePuzzle.key }} · use all {{ activePuzzle.settings.numCards }} cards
        </span>
      </div>
    </div>

    <div class="puzzle-play-header__board" aria-label="Top three puzzle scores">
      <span class="puzzle-play-header__board-title">
        TOP 3
        <em>{{ activeStatus === 'online' ? 'shared' : activeStatus === 'local' ? 'local' : 'reading' }}</em>
      </span>
      <ol v-if="activeTopThree.length">
        <li v-for="(row, index) in activeTopThree" :key="`${row.playerName}-${row.submittedAt}`">
          <span>{{ index + 1 }}</span>
          <b>{{ row.playerName }}</b>
          <strong>{{ formatNumber(row.score) }}</strong>
        </li>
      </ol>
      <span v-else class="puzzle-play-header__empty">No scores yet</span>
    </div>

    <div class="puzzle-play-header__state">
      <span v-if="puzzleSubmitError" class="puzzle-play-header__error" role="alert">
        ⚠ {{ puzzleSubmitError }}
      </span>
      <span v-else-if="missingCards > 0" class="puzzle-play-header__hint">
        {{ missingCards }} card{{ missingCards === 1 ? '' : 's' }} still off the board
      </span>
      <span v-else-if="canSubmit" class="puzzle-play-header__ready">
        Board ready
      </span>
      <span v-else class="puzzle-play-header__hint">Finish one expression to submit</span>
      <span v-if="submitting" class="puzzle-play-header__hint">Sending…</span>
    </div>
  </section>
</template>

<style scoped>
.puzzle-play-header {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(260px, 1fr) minmax(150px, 0.7fr);
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  background: linear-gradient(180deg, rgba(37, 28, 52, 0.98), rgba(17, 13, 26, 0.98));
  border: 3px solid rgba(255, 190, 11, 0.55);
  outline: 3px solid #09080f;
  box-shadow: 0 4px 0 #09080f;
}

.puzzle-play-header__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.puzzle-play-header__badge {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  background: #0b0912;
  color: var(--gold);
  border: 2px solid rgba(255, 190, 11, 0.5);
  padding: 4px 6px;
}

.puzzle-play-header__identity strong {
  display: block;
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--gold-bright);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puzzle-play-header__sub {
  display: block;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 0.83rem;
  color: var(--ink-muted);
}

.puzzle-play-header__board {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding-left: 12px;
  border-left: 1px solid rgba(242, 201, 76, 0.25);
}

.puzzle-play-header__board-title {
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.12em;
  color: var(--gold);
}

.puzzle-play-header__board-title em {
  margin-left: 5px;
  font-style: normal;
  color: var(--ink-muted);
}

.puzzle-play-header__board ol {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.puzzle-play-header__board li {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  background: #0f0c17;
  border: 1px solid rgba(242, 201, 76, 0.2);
  padding: 2px 5px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.puzzle-play-header__board li > span:first-child {
  color: var(--gold);
}

.puzzle-play-header__board b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  color: var(--ink-cream);
}

.puzzle-play-header__board strong {
  margin-left: auto;
  color: #fff;
}

.puzzle-play-header__empty {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.puzzle-play-header__state {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.25;
}

.puzzle-play-header__hint {
  color: var(--ink-muted);
}

.puzzle-play-header__ready {
  color: #72efdd;
}

.puzzle-play-header__error {
  color: #ffb3b3;
}

@media (max-width: 900px) {
  .puzzle-play-header {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .puzzle-play-header__board {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
