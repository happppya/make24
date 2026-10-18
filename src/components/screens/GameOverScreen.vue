<script setup lang="ts">
import { useGameContext } from '../../app/context'
import { pointsLabel, spriteUrl } from '../../app/labels'

const {
  menuOpen,
  tutorialOpen,
  settings,
  players,
  matchWinners,
  matchWinner,
  matchWinnerNames,
  matchWinnerIds,
  multiplayerHost,
  startMatchFromLobby,
  goToLobby,
} = useGameContext()
</script>

<template>
<main class="screen-game-over" :inert="menuOpen || tutorialOpen">
  <div class="results-cabinet results-cabinet--final">
    <div class="results-marquee">
      <span class="results-marquee__round">FINAL BELL</span>
      <span class="results-marquee__target">SERIES OVER</span>
    </div>

    <img
      :src="spriteUrl('joker-black.png')"
      alt="Joker"
      class="pixel-sprite gameover-joker"
    />
    <h2 class="gameover-title">MATCH COMPLETE</h2>
    <p v-if="matchWinners.length > 1" class="winner-callout" data-testid="match-draw-callout">
      Series shared: <strong>{{ matchWinnerNames }}</strong> ·
      <strong>{{ pointsLabel(matchWinners[0]?.points ?? 0) }} each</strong>
    </p>
    <p v-else-if="matchWinner" class="winner-callout">
      Series winner: <strong>{{ matchWinner.name }}</strong> ·
      <strong>{{ pointsLabel(matchWinner.points) }}</strong>
    </p>
    <p v-else class="winner-callout">Match ended early — no winner on the board.</p>

    <div class="standings-row standings-row--centered">
      <div
        v-for="p in players"
        :key="p.id"
        class="standing-card"
        :class="{ 'standing-card--top': matchWinnerIds.includes(p.id) }"
      >
        <span class="standing-name">{{ p.name }}</span>
        <span class="standing-pts">{{ pointsLabel(p.points) }}</span>
      </div>
    </div>

    <div class="round-end-actions round-end-actions--centered">
      <button
        type="button"
        class="btn-arcade btn-arcade--gold"
        :disabled="settings.isMultiplayer && !multiplayerHost"
        @click="startMatchFromLobby"
      >
        Play Again
      </button>
      <button type="button" class="btn-arcade" @click="goToLobby">
        Return to Lobby
      </button>
    </div>
  </div>
</main>
</template>

<style scoped>
@keyframes fan-bob {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -6px;
  }
}

.results-cabinet--final {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-color: var(--crimson);
}

.gameover-title {
  margin: 12px 0 4px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  color: var(--gold);
  text-shadow: 0 4px 0 #09080f;
}

.standings-row--centered,
.round-end-actions--centered {
  justify-content: center;
}

.standing-card--top {
  border-color: var(--gold);
  background: rgba(255, 190, 11, 0.14);
  box-shadow: 0 4px 0 #09080f;
}

.gameover-joker {
  width: 84px;
  height: 112px;
  margin-top: 16px;
  animation: fan-bob 3s ease-in-out infinite;
}

.winner-callout {
  font-size: 1.2rem;
  margin: 8px 0 20px;
}
</style>
