<script setup lang="ts">
import { computed } from 'vue'
import DifficultyChip from '../DifficultyChip.vue'
import { useGameContext } from '../../app/context'
import { DUNGEON_GAUNTLETS, DUNGEON_GROUPS } from '../../engine/dungeon'

const {
  menuOpen,
  tutorialOpen,
  dungeonCleared,
  dungeonTotal,
  gauntletComplete,
  gauntletProgress,
  gauntletUnlocked,
  openGauntlet,
  goToTitle,
} = useGameContext()

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const groups = computed(() =>
  DUNGEON_GROUPS.map((group) => {
    const gauntlets = group.gauntlets.map((gauntlet, index) => ({
      gauntlet,
      numeral: ROMAN[index] ?? String(index + 1),
      unlocked: gauntletUnlocked(gauntlet.id),
      complete: gauntletComplete(gauntlet),
      cleared: gauntletProgress(gauntlet),
      firstDifficulty: gauntlet.trials[0]!.difficulty,
      lastDifficulty: gauntlet.trials[gauntlet.trials.length - 1]!.difficulty,
      lockedBy: group.gauntlets[index - 1]?.name ?? null,
    }))
    return {
      group,
      gauntlets,
      clearedTrials: gauntlets.reduce((total, entry) => total + entry.cleared, 0),
      totalTrials: group.gauntlets.reduce(
        (total, gauntlet) => total + gauntlet.trials.length,
        0
      ),
      clearedGauntlets: gauntlets.filter((entry) => entry.complete).length,
    }
  })
)

const percent = computed(() =>
  dungeonTotal.value === 0 ? 0 : Math.round((dungeonCleared.value / dungeonTotal.value) * 100)
)
const gauntletsCleared = computed(() =>
  groups.value.reduce((total, group) => total + group.clearedGauntlets, 0)
)
</script>

<template>
  <main class="screen-dungeon" :inert="menuOpen || tutorialOpen">
    <div class="dungeon-marquee">
      <div class="dungeon-marquee__left">
        <span class="dungeon-marquee__badge">THE DUNGEON</span>
        <span class="dungeon-marquee__name">Two Chapters</span>
      </div>
      <button
        type="button"
        class="btn-arcade btn-arcade--tiny"
        data-testid="dungeon-back-btn"
        @click="goToTitle"
      >
        ◂ Main Menu
      </button>
    </div>

    <section class="dungeon-hero">
      <div class="dungeon-hero__copy">
        <h1>
          {{ DUNGEON_GAUNTLETS.length }} gauntlets.<br />
          <span>{{ dungeonTotal }} trials.</span>
        </h1>
      </div>

      <div class="dungeon-progress" data-testid="dungeon-progress">
        <div class="dungeon-progress__label">
          <span>Campaign</span>
          <strong>{{ dungeonCleared }} / {{ dungeonTotal }}</strong>
        </div>
        <div class="dungeon-progress__bar" role="progressbar" :aria-valuenow="dungeonCleared" aria-valuemin="0" :aria-valuemax="dungeonTotal">
          <span :style="{ width: `${percent}%` }"></span>
        </div>
        <div class="dungeon-progress__foot">
          <span>{{ gauntletsCleared }} / {{ DUNGEON_GAUNTLETS.length }} gauntlets cleared</span>
          <span>{{ percent }}%</span>
        </div>
      </div>
    </section>

    <section
      v-for="chapter in groups"
      :key="chapter.group.id"
      class="dungeon-chapter"
      :style="{ '--group-accent': chapter.group.accent }"
      :data-testid="`dungeon-group-${chapter.group.id}`"
    >
      <header class="chapter-marquee">
        <div class="chapter-marquee__identity">
          <span class="chapter-marquee__sigil" aria-hidden="true">{{ chapter.group.sigil }}</span>
          <div>
            <span class="chapter-marquee__chapter">{{ chapter.group.chapter }}</span>
            <h2>{{ chapter.group.name }}</h2>
            <p>{{ chapter.group.theme }}</p>
          </div>
        </div>
        <div class="chapter-marquee__progress">
          <span>
            <em>Gauntlets</em>
            {{ chapter.clearedGauntlets }} / {{ chapter.gauntlets.length }}
          </span>
          <span>
            <em>Trials</em>
            {{ chapter.clearedTrials }} / {{ chapter.totalTrials }}
          </span>
        </div>
      </header>

      <ol class="gauntlet-list">
        <li v-for="entry in chapter.gauntlets" :key="entry.gauntlet.id">
          <button
            type="button"
            class="gauntlet-card"
            :class="{
              'gauntlet-card--locked': !entry.unlocked,
              'gauntlet-card--cleared': entry.complete,
            }"
            :style="{ '--gauntlet-accent': entry.gauntlet.accent }"
            :disabled="!entry.unlocked"
            :data-testid="`gauntlet-${entry.gauntlet.id}`"
            @click="openGauntlet(entry.gauntlet.id)"
          >
            <span class="gauntlet-card__index">{{ entry.numeral }}</span>
            <span class="gauntlet-card__sigil" aria-hidden="true">{{ entry.gauntlet.sigil }}</span>

            <span class="gauntlet-card__body">
              <span class="gauntlet-card__title-row">
                <strong>{{ entry.gauntlet.name }}</strong>
                <span v-if="entry.complete" class="gauntlet-card__stamp">CLEARED</span>
                <span v-else-if="!entry.unlocked" class="gauntlet-card__stamp gauntlet-card__stamp--locked">
                  SEALED
                </span>
              </span>
              <span class="gauntlet-card__theme">{{ entry.gauntlet.theme }}</span>
              <span class="gauntlet-card__difficulty">
                <DifficultyChip :difficulty="entry.firstDifficulty" compact />
                <span class="gauntlet-card__arrow" aria-hidden="true">→</span>
                <DifficultyChip :difficulty="entry.lastDifficulty" compact />
                <span class="gauntlet-card__trials">{{ entry.gauntlet.trials.length }} trials</span>
              </span>
              <span v-if="!entry.unlocked" class="gauntlet-card__locked">
                Clear {{ entry.lockedBy }} to open this door.
              </span>
            </span>

            <span class="gauntlet-card__side">
              <span class="gauntlet-card__count">{{ entry.cleared }} / {{ entry.gauntlet.trials.length }}</span>
              <span class="gauntlet-card__pips" aria-hidden="true">
                <span
                  v-for="(trial, trialIndex) in entry.gauntlet.trials"
                  :key="trial.id"
                  :class="{ 'is-cleared': trialIndex < entry.cleared }"
                ></span>
              </span>
              <span class="gauntlet-card__enter">
                {{ entry.complete ? 'Revisit' : entry.unlocked ? 'Enter ▸' : 'Locked' }}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </section>

    <p class="dungeon-footnote">
      Progress and your best score for each trial are kept on this device. Every
      trial is generated once from its gauntlet and slot, so the same door always
      opens onto the same hand.
    </p>
  </main>
</template>

<style scoped>
.screen-dungeon {
  flex: 1;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px 20px 42px;
}

.dungeon-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  background:
    linear-gradient(90deg, rgba(254, 74, 73, 0.14), transparent 46%),
    linear-gradient(180deg, #2a1830, #160f1e);
  border: 4px solid #9c2a3d;
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.1),
    0 8px 0 #09080f;
  padding: 10px 14px;
  margin-bottom: 20px;
}

.dungeon-marquee__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dungeon-marquee__badge {
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  background: #0b0912;
  color: #ff9daa;
  border: 2px solid rgba(254, 74, 73, 0.55);
  padding: 4px 8px;
}

.dungeon-marquee__name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: #ffd9de;
  text-shadow: 0 3px 0 #09080f;
}

.dungeon-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 24px;
  align-items: end;
  padding: 6px 4px 24px;
}

.dungeon-hero h1 {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 3.2vw, 2.2rem);
  line-height: 1.32;
  color: var(--ink-cream);
  text-shadow: 0 4px 0 #09080f;
}

.dungeon-hero h1 span {
  color: #ff8fa3;
}

.dungeon-progress {
  background: #13101c;
  border: 3px solid #3c3357;
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 12px 14px;
}

.dungeon-progress__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  color: var(--gold);
}

.dungeon-progress__label strong {
  font-family: var(--font-mono);
  font-size: 1.3rem;
  font-weight: 400;
  letter-spacing: 0;
  color: #fff;
}

.dungeon-progress__bar {
  height: 12px;
  margin: 10px 0 8px;
  background: #09080f;
  border: 2px solid #2a2438;
  overflow: hidden;
}

.dungeon-progress__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #9c2a3d, #fe4a49 60%, #ffbe0b);
  transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.dungeon-progress__foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.dungeon-chapter {
  margin-bottom: 22px;
}

.chapter-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  padding: 9px 13px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--group-accent) 13%, transparent), transparent 52%),
    linear-gradient(180deg, #241a34, #171226);
  border: 3px solid var(--group-accent);
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 6px 0 #09080f;
}

.chapter-marquee__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chapter-marquee__sigil {
  flex: none;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  font-size: 1.4rem;
  line-height: 1;
  color: var(--group-accent);
  background: rgba(9, 8, 15, 0.6);
  border: 2px solid color-mix(in srgb, var(--group-accent) 55%, transparent);
  text-shadow: 0 3px 0 #09080f;
}

.chapter-marquee__chapter {
  display: block;
  margin-bottom: 2px;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.18em;
  color: var(--group-accent);
}

.chapter-marquee h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 400;
  line-height: 1.2;
  color: var(--ink-cream);
  text-shadow: 0 3px 0 #09080f;
}

.chapter-marquee p {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.3;
  color: var(--ink-muted);
}

.chapter-marquee__progress {
  display: flex;
  gap: 14px;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--ink-cream);
}

.chapter-marquee__progress span {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  padding-left: 14px;
  border-left: 1px solid color-mix(in srgb, var(--group-accent) 30%, transparent);
  white-space: nowrap;
}

.chapter-marquee__progress em {
  font-style: normal;
  font-family: var(--font-pixel);
  font-size: 0.44rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--group-accent);
}

.gauntlet-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gauntlet-card {
  --gauntlet-accent: var(--gold);
  position: relative;
  display: grid;
  grid-template-columns: 44px 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 13px 16px 13px 12px;
  text-align: left;
  color: inherit;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--gauntlet-accent) 12%, transparent), transparent 42%),
    linear-gradient(180deg, #221a2e 0%, #120f1b 100%);
  border: 3px solid color-mix(in srgb, var(--gauntlet-accent) 55%, #2b2439);
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 7px 0 #09080f;
  cursor: pointer;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.gauntlet-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--gauntlet-accent);
  opacity: 0.8;
}

.gauntlet-card:hover:not(:disabled),
.gauntlet-card:focus-visible {
  transform: translateY(-4px);
  border-color: var(--gauntlet-accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 11px 0 #09080f,
    0 0 24px color-mix(in srgb, var(--gauntlet-accent) 26%, transparent);
}

.gauntlet-card:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #09080f;
}

.gauntlet-card:disabled {
  cursor: not-allowed;
  filter: saturate(0.35) brightness(0.72);
}

.gauntlet-card__index {
  font-family: var(--font-display);
  font-size: 1.05rem;
  text-align: center;
  color: var(--gauntlet-accent);
  text-shadow: 0 3px 0 #09080f;
}

.gauntlet-card__sigil {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 1.65rem;
  line-height: 1;
  color: var(--gauntlet-accent);
  background: rgba(9, 8, 15, 0.6);
  border: 2px solid color-mix(in srgb, var(--gauntlet-accent) 45%, transparent);
  text-shadow: 0 3px 0 #09080f;
}

.gauntlet-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.gauntlet-card__title-row {
  display: flex;
  align-items: baseline;
  gap: 9px;
  flex-wrap: wrap;
}

.gauntlet-card__title-row strong {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 400;
  color: var(--ink-cream);
  text-shadow: 0 3px 0 #09080f;
}

.gauntlet-card__theme {
  font-family: var(--font-mono);
  font-size: 0.94rem;
  line-height: 1.3;
  color: var(--ink-muted);
}

.gauntlet-card__difficulty {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.gauntlet-card__arrow {
  color: var(--ink-muted);
  font-size: 0.8rem;
}

.gauntlet-card__trials {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: rgba(247, 240, 224, 0.5);
}

.gauntlet-card__locked {
  font-family: var(--font-mono);
  font-size: 0.86rem;
  color: #ffb3bd;
}

.gauntlet-card__stamp {
  padding: 2px 6px;
  font-family: var(--font-pixel);
  font-size: 0.46rem;
  letter-spacing: 0.12em;
  color: #6fd68a;
  border: 1px solid rgba(111, 214, 138, 0.55);
  background: rgba(111, 214, 138, 0.08);
}

.gauntlet-card__stamp--locked {
  color: #ffb3bd;
  border-color: rgba(255, 143, 163, 0.45);
  background: rgba(254, 74, 73, 0.07);
}

.gauntlet-card__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  min-width: 118px;
}

.gauntlet-card__count {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: #fff;
}

.gauntlet-card__pips {
  display: flex;
  gap: 3px;
}

.gauntlet-card__pips span {
  width: 15px;
  height: 6px;
  background: #241f31;
  border: 1px solid #3a3350;
}

.gauntlet-card__pips span.is-cleared {
  background: var(--gauntlet-accent);
  border-color: var(--gauntlet-accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--gauntlet-accent) 55%, transparent);
}

.gauntlet-card__enter {
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.1em;
  color: var(--gauntlet-accent);
}

.dungeon-footnote {
  margin: 20px 0 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  line-height: 1.4;
  color: rgba(247, 240, 224, 0.4);
}

@media (max-width: 820px) {
  .dungeon-hero {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .gauntlet-card {
    grid-template-columns: 40px 44px minmax(0, 1fr);
  }
  .gauntlet-card__index {
    font-size: 0.9rem;
  }
  .gauntlet-card__sigil {
    width: 40px;
    height: 40px;
    font-size: 1.35rem;
  }
  .gauntlet-card__side {
    grid-column: 2 / -1;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
}

@media (max-width: 560px) {
  .screen-dungeon {
    padding: 12px 12px 32px;
  }
  .chapter-marquee__progress {
    width: 100%;
  }
  .chapter-marquee__progress span {
    align-items: flex-start;
  }
  .gauntlet-card {
    padding: 11px 10px;
    gap: 9px;
  }
  .gauntlet-card__theme,
  .gauntlet-card__locked {
    font-size: 0.86rem;
  }
}
</style>
