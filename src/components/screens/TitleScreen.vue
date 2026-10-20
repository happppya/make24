<script setup lang="ts">
import { useGameContext } from '../../app/context'
import { spriteUrl } from '../../app/labels'

const { menuOpen, tutorialOpen, enterLobby, openTutorial, tutorialTriggerRef } = useGameContext()

// Bound to the tutorial button below as a string ref; vue-tsc does not count
// that as a use, so it is named here to keep the binding honest.
void tutorialTriggerRef
</script>

<template>
<main class="screen-title" :inert="menuOpen || tutorialOpen">
  <span class="title-suits" aria-hidden="true">♠ ♥ ♣ ♦</span>
  <div class="title-stack">
    <div class="hero-card-fan" aria-hidden="true">
      <img
        :src="spriteUrl('ace-of-spades-large.png')"
        alt="Ace of Spades"
        class="fan-card fan-card--1 pixel-sprite"
      />
      <img
        :src="spriteUrl('8-of-hearts.png')"
        alt="8 of Hearts"
        class="fan-card fan-card--2 pixel-sprite"
      />
      <img
        :src="spriteUrl('3-of-clubs.png')"
        alt="3 of Clubs"
        class="fan-card fan-card--3 pixel-sprite"
      />
      <img
        :src="spriteUrl('queen-of-diamonds.png')"
        alt="Queen of Diamonds"
        class="fan-card fan-card--4 pixel-sprite"
      />
    </div>

    <h1 class="hero-heading">
      <span class="hero-heading__make">MAKE</span>
      <span class="hero-heading__num">24</span>
    </h1>

    <div class="mode-cards">
      <button
        type="button"
        class="mode-btn mode-btn--solo"
        data-testid="enter-singleplayer"
        @click="enterLobby(false)"
      >
        <span class="mode-btn__sigil" aria-hidden="true">♠</span>
        <span class="mode-btn__body">
          <span class="mode-btn__title">SOLO</span>
          <span class="mode-btn__copy">No clock. Finish when you like.</span>
        </span>
        <span class="mode-btn__arrow" aria-hidden="true">▸</span>
      </button>

      <button
        type="button"
        class="mode-btn mode-btn--versus"
        data-testid="enter-multiplayer"
        @click="enterLobby(true)"
      >
        <span class="mode-btn__sigil" aria-hidden="true">♥</span>
        <span class="mode-btn__body">
          <span class="mode-btn__title">MULTIPLAYER</span>
          <span class="mode-btn__copy">Play competitive against friends.</span>
        </span>
        <span class="mode-btn__arrow" aria-hidden="true">▸</span>
      </button>
    </div>

    <button
      ref="tutorialTriggerRef"
      type="button"
      class="title-guide"
      data-testid="open-tutorial"
      @click="openTutorial"
    >
      <span class="title-guide__icon" aria-hidden="true">?</span>
      <span class="title-guide__label">Tutorial</span>
    </button>
  </div>
</main>
</template>

<style scoped>
/* Title screen: full-bleed splash, no cabinet frame */
.screen-title {
  flex: 1;
  position: relative;
  display: grid;
  place-items: center;
  padding: clamp(30px, 6vh, 70px) 24px clamp(40px, 7vh, 80px);
  overflow: hidden;
}

/* Warm spotlight behind the logo so the artwork sits on something */
.screen-title::before {
  content: '';
  position: absolute;
  inset: -10% -5%;
  background:
    radial-gradient(ellipse 46% 40% at 50% 30%, rgba(255, 190, 11, 0.18), transparent 70%),
    radial-gradient(ellipse 60% 34% at 50% 88%, rgba(254, 74, 73, 0.14), transparent 72%);
  pointer-events: none;
}

/* Faint oversized suits, pixel-dithered into the felt */
.title-suits {
  position: absolute;
  inset: auto 0 -2vh;
  font-family: var(--font-display);
  font-size: clamp(9rem, 26vw, 22rem);
  letter-spacing: -0.02em;
  text-align: center;
  color: rgba(247, 240, 224, 0.035);
  pointer-events: none;
  user-select: none;
}

.title-stack {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(14px, 2.4vh, 28px);
  width: min(960px, 100%);
  max-width: 100%;
  text-align: center;
}

.hero-card-fan {
  display: flex;
  justify-content: center;
  align-items: center;
  max-width: 100%;
}

/* Cards scale with the shorter axis so the fan never spills off narrow phones */
.fan-card {
  display: block;
  width: auto;
  height: clamp(104px, min(26vh, 26vw), 240px);
  margin: 0 clamp(-20px, -1.4vw, -6px);
  filter: drop-shadow(0 8px 0 rgba(12, 9, 16, 0.85));
  animation: fan-bob 3.4s ease-in-out infinite;
}

.fan-card--1 {
  transform: rotate(-12deg) translateY(10px);
  animation-delay: 0s;
}

.fan-card--2 {
  transform: rotate(-4deg);
  animation-delay: 0.25s;
}

.fan-card--3 {
  transform: rotate(4deg);
  animation-delay: 0.5s;
}

.fan-card--4 {
  transform: rotate(12deg) translateY(10px);
  animation-delay: 0.75s;
}

.hero-heading {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: clamp(10px, 1.8vw, 26px);
  margin: 0;
  line-height: 0.82;
}

.hero-heading__make {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, min(3.8vw, 5vh), 3.2rem);
  color: var(--ink-cream);
  letter-spacing: 0.06em;
  text-shadow:
    0 5px 0 var(--crimson-dark),
    0 10px 0 #09080f,
    0 14px 26px rgba(9, 8, 15, 0.65);
}

.hero-heading__num {
  font-family: var(--font-display);
  font-size: clamp(3.4rem, min(13.5vw, 22vh), 10.5rem);
  color: var(--gold-bright);
  text-shadow:
    0 6px 0 #b06b00,
    0 13px 0 #09080f,
    0 0 42px rgba(255, 190, 11, 0.5);
  animation: title-pulse 2.6s ease-in-out infinite;
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(12px, 1.6vw, 20px);
  width: min(860px, 100%);
  margin-top: clamp(4px, 1.6vh, 16px);
}

/* Chunky arcade slab buttons: sigil, label, arrow */
.mode-btn {
  --accent: #72efdd;
  --accent-glow: rgba(114, 239, 221, 0.35);
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 18px 20px 17px;
  text-align: left;
  font-family: inherit;
  color: inherit;
  background: linear-gradient(180deg, #2b2239 0%, #151021 100%);
  border: 3px solid #3c3357;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 8px 0 #09080f;
  cursor: pointer;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

/* Coloured lip across the top, like a lit cabinet button */
.mode-btn::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--accent);
  opacity: 0.75;
}

.mode-btn--versus {
  --accent: #ff8fa3;
  --accent-glow: rgba(254, 74, 73, 0.4);
}

.mode-btn:hover,
.mode-btn:focus-visible {
  transform: translateY(-6px);
  border-color: var(--accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 14px 0 #09080f,
    0 0 26px var(--accent-glow);
}

.mode-btn:active {
  transform: translateY(3px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 3px 0 #09080f;
}

.mode-btn__sigil {
  font-size: 2rem;
  line-height: 1;
  color: var(--accent);
  text-shadow: 0 3px 0 #09080f;
}

.mode-btn__body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.mode-btn__title {
  font-family: var(--font-display);
  font-size: clamp(0.9rem, 1.5vw, 1.05rem);
  letter-spacing: 0.06em;
  color: var(--gold);
}

.mode-btn__copy {
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.mode-btn__arrow {
  font-family: var(--font-pixel);
  font-size: 0.9rem;
  color: var(--accent);
  transition: translate 0.16s ease;
}

/* Tutorial entry: a slim manual tab under the two mode slabs */
.title-guide {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: clamp(10px, 1.8vh, 18px);
  padding: 9px 16px 9px 12px;
  background: rgba(19, 16, 32, 0.72);
  border: 2px solid rgba(255, 190, 11, 0.5);
  outline: 2px solid #09080f;
  color: var(--ink-cream);
  cursor: pointer;
  box-shadow: 0 5px 0 #09080f;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    background 0.16s ease;
}

.title-guide:hover,
.title-guide:focus-visible {
  transform: translateY(-3px);
  border-color: var(--gold);
  background: rgba(38, 30, 56, 0.92);
}

.title-guide:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #09080f;
}

.title-guide__icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: var(--gold);
  color: #15111e;
  font-family: var(--font-display);
  font-size: 0.68rem;
  line-height: 1;
  border: 2px solid #09080f;
}

.title-guide__label {
  font-family: var(--font-pixel);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold-bright);
}

.title-guide__hint {
  padding-left: 10px;
  border-left: 2px solid rgba(255, 190, 11, 0.3);
  font-family: var(--font-mono);
  font-size: 0.94rem;
  color: var(--ink-muted);
}

@media (max-width: 620px) {
    .title-guide__hint {
      display: none;
    }
}

.mode-btn:hover .mode-btn__arrow,
.mode-btn:focus-visible .mode-btn__arrow {
  translate: 4px 0;
}

@keyframes fan-bob {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -6px;
  }
}

@keyframes title-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 10px rgba(255, 190, 11, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 22px rgba(255, 190, 11, 0.75));
  }
}

@media (max-width: 760px) {
    .screen-title {
      padding: 24px 18px 32px;
    }
    .mode-cards {
      grid-template-columns: 1fr;
      width: min(420px, 100%);
    }
    .mode-btn {
      padding: 14px 16px;
    }
    .hero-heading {
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .hero-heading__num {
      font-size: clamp(4rem, 26vw, 6rem);
      margin-top: 6px;
    }
}
</style>
