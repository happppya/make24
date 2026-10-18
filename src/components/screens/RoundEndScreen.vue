<script setup lang="ts">
import { useGameContext } from '../../app/context'
import { formatNumber } from '../../engine/math'

const {
  menuOpen,
  tutorialOpen,
  settings,
  players,
  roundNumber,
  currentTarget,
  roundWinnerIds,
  roundWinnerNames,
  sortedRoundSolutions,
  winningSolutionIds,
  matchWinnerIds,
  multiplayerHost,
  advanceAfterRoundEnd,
  endEntireGameNow,
  goToLobby,
} = useGameContext()
</script>

<template>
<main class="screen-round-end" :inert="menuOpen || tutorialOpen">
  <div
    class="results-cabinet"
    :class="roundWinnerIds.length ? 'results-cabinet--win' : 'results-cabinet--bust'"
  >
    <div class="results-marquee">
      <span class="results-marquee__round">ROUND {{ roundNumber }}</span>
      <span class="results-marquee__target">
        TARGET <strong>{{ formatNumber(currentTarget) }}</strong>
      </span>
    </div>

    <div
      class="results-stamp"
      :class="roundWinnerIds.length ? 'results-stamp--win' : 'results-stamp--bust'"
    >
      {{
        roundWinnerIds.length > 1
          ? 'POINT SPLIT'
          : roundWinnerIds.length
            ? 'ROUND CLEAR'
            : 'NO POINT'
      }}
    </div>

    <p v-if="roundWinnerIds.length > 1" class="split-note" data-testid="round-tie-note">
      Equal best boards, so <strong>{{ roundWinnerNames }}</strong> each take a point.
    </p>

    <h2 class="results-title">
      <template v-if="settings.isMultiplayer && settings.mode === 'first-to-solve'">
        Winning solution
      </template>
      <template v-else-if="roundWinnerIds.length > 1">
        Best expression, shared
      </template>
      <template v-else>
        {{ roundWinnerIds.length ? 'Best expression this round' : 'Nobody closed the round' }}
      </template>
    </h2>

    <div v-if="sortedRoundSolutions.length > 0" class="solutions-table">
      <div
        v-for="(sol, idx) in settings.isMultiplayer && settings.mode === 'first-to-solve'
          ? sortedRoundSolutions.slice(0, 1)
          : sortedRoundSolutions"
        :key="sol.id"
        class="solution-row"
        :class="{ 'solution-row--winner': winningSolutionIds.has(sol.id) }"
      >
        <div class="sol-rank">
          {{ winningSolutionIds.has(sol.id) ? '★ WINNER' : `#${idx + 1}` }}
        </div>
        <div class="sol-player">
          <strong>{{ sol.playerName }}</strong>
          <span class="sol-ws">Workspace {{ sol.workspaceIndex }}</span>
        </div>
        <div class="sol-equation" data-testid="round-end-equation">
          {{ sol.equation }}
        </div>
        <div class="sol-score">
          <span class="score-pill">{{ sol.score }} pts</span>
          <span v-if="settings.approximationPercent > 0" class="error-sub">
            ({{ formatNumber(sol.errorPercent) }}% err)
          </span>
        </div>
      </div>
    </div>

    <div v-else class="no-solutions-banner">
      No acceptable expressions were submitted. Nobody takes the point — deal again and try a
      cheaper route.
    </div>

    <!-- Standings -->
    <div class="standings-strip">
      <h3>Match standings · first to {{ settings.firstToPoints }} pts</h3>
      <div class="standings-row">
        <div v-for="p in players" :key="p.id" class="standing-card">
          <span class="standing-name">
            {{ p.name }}
            <span v-if="p.isWaiting" class="standing-tag">NEXT DEAL</span>
          </span>
          <span class="standing-pts">{{ p.points }} / {{ settings.firstToPoints }} pts</span>
        </div>
      </div>
    </div>

    <div class="round-end-actions">
      <button
        type="button"
        class="btn-arcade btn-arcade--gold"
        data-testid="next-round-btn"
        :disabled="settings.isMultiplayer && !multiplayerHost"
        @click="advanceAfterRoundEnd"
      >
        {{ matchWinnerIds.length ? 'View Match Winner' : 'Deal Next Round' }}
      </button>
      <button type="button" class="btn-arcade" @click="goToLobby">
        Back to Lobby
      </button>
      <button
        type="button"
        class="btn-arcade btn-arcade--crimson"
        :disabled="settings.isMultiplayer && !multiplayerHost"
        @click="endEntireGameNow"
      >
        End Game
      </button>
    </div>
  </div>
</main>
</template>

<style scoped>
.results-cabinet--bust {
  border-color: #6b5a7a;
}

.results-cabinet--win {
  border-color: var(--gold);
}

.results-stamp {
  display: inline-block;
  margin: 20px 0 6px;
  padding: 10px 18px 8px;
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
  border: 4px solid;
  outline: 4px solid #09080f;
  box-shadow: 0 8px 0 #09080f;
  transform: rotate(-4deg);
  animation: stamp-drop 0.45s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.results-stamp--win {
  background: var(--gold);
  border-color: #fff9db;
  color: #15111e;
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.5);
}

.results-stamp--bust {
  background: #2a2338;
  border-color: var(--crimson);
  color: #ffb3b3;
}

.results-title {
  margin: 10px 0 16px;
  font-family: var(--font-pixel);
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-cream);
}

/* Shown when several boards tie for best and share the round */
.split-note {
  margin: 6px 0 0;
  max-width: 46ch;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  line-height: 1.3;
  color: var(--gold-bright);
}

.split-note strong {
  color: var(--ink-cream);
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

.solutions-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
}

.solution-row {
  display: grid;
  grid-template-columns: 100px 150px 1fr auto;
  align-items: center;
  gap: 12px;
  background: #241f30;
  border: 2px solid rgba(242, 201, 76, 0.4);
  padding: 12px 14px;
}

@media (max-width: 700px) {
    .solution-row {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'rank score'
        'player player'
        'eq eq';
      row-gap: 8px;
    }
    .sol-rank {
      grid-area: rank;
      white-space: nowrap;
      font-size: 0.76rem;
    }
    .sol-score {
      grid-area: score;
      justify-self: end;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
    }
    .sol-player {
      grid-area: player;
    }
    .sol-equation {
      grid-area: eq;
      font-size: 0.92rem;
      overflow-wrap: anywhere;
    }
}

.solution-row--winner {
  border-color: var(--gold);
  background: rgba(242, 201, 76, 0.12);
}

.sol-rank {
  font-weight: 900;
  color: var(--gold);
  font-size: 0.85rem;
}

.sol-player {
  display: flex;
  flex-direction: column;
}

.sol-ws {
  font-size: 0.74rem;
  color: var(--ink-muted);
}

.sol-equation {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
}

.score-pill {
  background: var(--gold);
  color: #191521;
  font-weight: 900;
  padding: 4px 9px;
  font-size: 0.85rem;
}

.no-solutions-banner {
  background: rgba(230, 57, 70, 0.16);
  border: 2px dashed var(--crimson);
  padding: 18px;
  text-align: center;
  margin-bottom: 20px;
}

.standings-strip {
  margin-bottom: 22px;
}

.standings-strip h3 {
  font-size: 0.9rem;
  color: var(--ink-muted);
  margin: 0 0 10px;
}
</style>
