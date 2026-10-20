<script setup lang="ts">
import { useGameContext } from '../app/context'

/** The chrome both lobby screens share: marquee header, back button, page frame. */
defineProps<{
  /** MULTIPLAYER / SINGLEPLAYER tag on the left of the marquee. */
  badge: string
  /** Screen name shown next to the badge. */
  title: string
  /** Optional test hook for the back button. */
  backTestId?: string
  /**
   * Lock the frame to the viewport so a screen with long content scrolls its
   * own panels instead of growing the page. Screens that pass this must give
   * their content a `min-height: 0` flex column to scroll inside.
   */
  fill?: boolean
}>()

const { menuOpen, tutorialOpen, targetPromptOpen, goToTitle } = useGameContext()
</script>

<template>
  <main
    class="screen-lobby"
    :class="{ 'screen-lobby--fill': fill }"
    :inert="menuOpen || tutorialOpen || targetPromptOpen"
  >
    <div class="lobby-marquee">
      <div class="lobby-marquee__left">
        <span class="lobby-marquee__badge">{{ badge }}</span>
        <span class="lobby-marquee__name">{{ title }}</span>
      </div>
      <button
        type="button"
        class="btn-arcade btn-arcade--tiny lobby-marquee__back"
        :data-testid="backTestId"
        @click="goToTitle"
      >
        ◂ Main Menu
      </button>
    </div>

    <slot />
  </main>
</template>

<style scoped>
.screen-lobby {
  flex: 1;
  padding: 18px 20px 30px;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
}

/* Long settings screens: the frame owns the viewport and the panels scroll
   themselves, so the start button and the marquee never leave the screen. */
.screen-lobby--fill {
  display: flex;
  flex-direction: column;
  /* `flex: 1` bases the height on content, which would ignore the locked
     height and let the page grow again. */
  flex: 0 0 auto;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.screen-lobby--fill .lobby-marquee {
  flex: 0 0 auto;
}

/* One column on narrow screens: stacked panels each want a full scroll area,
   which a locked viewport cannot give them, so fall back to page scrolling. */
@media (max-width: 900px) {
  .screen-lobby--fill {
    flex: 1 1 auto;
    height: auto;
    overflow: visible;
  }
}

.lobby-marquee {
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

.lobby-marquee__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lobby-marquee__badge {
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  background: #0b0912;
  color: var(--gold);
  border: 2px solid rgba(255, 190, 11, 0.55);
  padding: 4px 8px;
}

.lobby-marquee__name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f;
}
</style>
