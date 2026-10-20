<script setup lang="ts">
import GameOverScreen from './components/screens/GameOverScreen.vue'
import LobbyBrowserScreen from './components/screens/LobbyBrowserScreen.vue'
import LobbySetupScreen from './components/screens/LobbySetupScreen.vue'
import PauseMenu from './components/screens/PauseMenu.vue'
import PlayingScreen from './components/screens/PlayingScreen.vue'
import PuzzleHubScreen from './components/screens/PuzzleHubScreen.vue'
import PuzzleResultScreen from './components/screens/PuzzleResultScreen.vue'
import RoundEndScreen from './components/screens/RoundEndScreen.vue'
import TargetChoiceDialog from './components/screens/TargetChoiceDialog.vue'
import TitleScreen from './components/screens/TitleScreen.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import { useGame } from './app/useGame'

const {
  phase,
  impactKind,
  shellRef,
  tutorialOpen,
  closeTutorial,
  targetPromptOpen,
} = useGame()

// `shellRef` is bound in the template as a string ref, which vue-tsc does not
// count as a use; this keeps it from reading as a dead binding.
void shellRef
</script>

<template>
  <div
    ref="shellRef"
    class="app-shell"
    :class="[impactKind ? `impact--${impactKind}` : '', { 'app-shell--playing': phase === 'playing' }]"
  >
    <!-- One screen per phase; each one injects the shared game context. -->
    <TitleScreen v-if="phase === 'title'" />
    <PuzzleHubScreen v-else-if="phase === 'puzzles'" />
    <LobbyBrowserScreen v-else-if="phase === 'lobby-select'" />
    <LobbySetupScreen v-else-if="phase === 'lobby'" />
    <PlayingScreen v-else-if="phase === 'playing'" />
    <RoundEndScreen v-else-if="phase === 'round-end'" />
    <PuzzleResultScreen v-else-if="phase === 'puzzle-result'" />
    <GameOverScreen v-else-if="phase === 'game-over'" />

    <PauseMenu />
    <TargetChoiceDialog v-if="targetPromptOpen" />
    <TutorialOverlay v-if="tutorialOpen" @close="closeTutorial" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* The table screen owns the viewport: a definite height stops short screens
   from growing the page into a scrollbar. Other screens keep natural height. */
.app-shell--playing {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

/* Target-hit flash on the shell */
.impact--hit::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9000;
  background: radial-gradient(circle at 28% 40%, rgba(255, 190, 11, 0.3), transparent 62%);
  animation: hit-flash 0.6s ease-out forwards;
}

@keyframes hit-flash {
  0% {
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
