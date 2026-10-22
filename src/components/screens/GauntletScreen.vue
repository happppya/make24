<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import DifficultyChip from '../DifficultyChip.vue'
import GauntletLoreDialog from '../GauntletLoreDialog.vue'
import { useGameContext } from '../../app/context'
import { gauntletById, gauntletGroup, getDungeonPuzzle } from '../../engine/dungeon'
import { formatNumber } from '../../engine/math'

const {
  menuOpen,
  tutorialOpen,
  selectedGauntlet,
  gauntletComplete,
  gauntletProgress,
  gauntletBest,
  trialCleared,
  trialRevealed,
  trialUnlocked,
  startDungeonTrial,
  openDungeon,
  openGauntlet,
  nextGauntletId,
} = useGameContext()

const loreOpen = ref(false)
const loreTriggerRef = ref<HTMLButtonElement | null>(null)

async function closeLore(): Promise<void> {
  loreOpen.value = false
  await nextTick()
  loreTriggerRef.value?.focus()
}

const group = computed(() =>
  selectedGauntlet.value ? gauntletGroup(selectedGauntlet.value.id) ?? null : null
)

const trials = computed(() => {
  const gauntlet = selectedGauntlet.value
  if (!gauntlet) return []
  return gauntlet.trials.map((trial, index) => ({
    trial,
    index,
    number: String(index + 1).padStart(2, '0'),
    puzzle: getDungeonPuzzle(gauntlet.id, trial.id),
    cleared: trialCleared(gauntlet.id, trial.id),
    revealed: trialRevealed(gauntlet.id, trial.id),
    unlocked: trialUnlocked(gauntlet, index),
    best: gauntletBest(gauntlet.id, trial.id),
    finale: index === gauntlet.trials.length - 1,
  }))
})

const cleared = computed(() =>
  selectedGauntlet.value ? gauntletProgress(selectedGauntlet.value) : 0
)
const total = computed(() => selectedGauntlet.value?.trials.length ?? 0)
const complete = computed(() =>
  selectedGauntlet.value ? gauntletComplete(selectedGauntlet.value) : false
)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((cleared.value / total.value) * 100)))
const nextId = computed(() =>
  selectedGauntlet.value ? nextGauntletId(selectedGauntlet.value.id) : null
)
const nextGauntlet = computed(() => (nextId.value ? gauntletById(nextId.value) ?? null : null))

function trialStatus(entry: (typeof trials.value)[number]): string {
  if (entry.revealed) return 'REVEALED'
  if (entry.cleared) return 'CLEARED'
  if (!entry.unlocked) return 'SEALED'
  return 'READY'
}
</script>

<template>
  <main v-if="selectedGauntlet" class="screen-gauntlet" :inert="menuOpen || tutorialOpen || loreOpen">
    <div class="gauntlet-marquee" :style="{ '--gauntlet-accent': selectedGauntlet.accent }">
      <div class="gauntlet-marquee__left">
        <span class="gauntlet-marquee__badge">{{ group?.chapter ?? 'THE DUNGEON' }}</span>
        <span class="gauntlet-marquee__name">{{ selectedGauntlet.name }}</span>
        <span v-if="group" class="gauntlet-marquee__group">{{ group.name }}</span>
      </div>
      <div class="gauntlet-marquee__actions">
        <button
          ref="loreTriggerRef"
          type="button"
          class="btn-arcade btn-arcade--tiny gauntlet-lore-btn"
          data-testid="gauntlet-lore-btn"
          aria-haspopup="dialog"
          :aria-expanded="loreOpen"
          @click="loreOpen = true"
        >
          ▤ Read Lore
        </button>
        <button
          type="button"
          class="btn-arcade btn-arcade--tiny"
          data-testid="gauntlet-back-btn"
          @click="openDungeon"
        >
          ◂ Dungeon Map
        </button>
      </div>
    </div>

    <section class="gauntlet-hero" :style="{ '--gauntlet-accent': selectedGauntlet.accent }">
      <div class="gauntlet-hero__sigil" aria-hidden="true">{{ selectedGauntlet.sigil }}</div>
      <div class="gauntlet-hero__copy">
        <h1>{{ selectedGauntlet.name }}</h1>
        <p class="gauntlet-hero__theme">{{ selectedGauntlet.theme }}</p>
        <p class="gauntlet-hero__intro">{{ selectedGauntlet.intro }}</p>
      </div>
      <div class="gauntlet-hero__progress">
        <div class="gauntlet-hero__count">
          <span>Trials cleared</span>
          <strong>{{ cleared }} / {{ total }}</strong>
        </div>
        <div
          class="gauntlet-hero__bar"
          role="progressbar"
          :aria-valuenow="cleared"
          aria-valuemin="0"
          :aria-valuemax="total"
        >
          <span :style="{ width: `${percent}%` }"></span>
        </div>
        <div class="gauntlet-hero__difficulty">
          <DifficultyChip :difficulty="selectedGauntlet.trials[0]!.difficulty" compact />
          <span aria-hidden="true">→</span>
          <DifficultyChip
            :difficulty="selectedGauntlet.trials[selectedGauntlet.trials.length - 1]!.difficulty"
            compact
          />
        </div>
      </div>
    </section>

    <section v-if="complete" class="gauntlet-cleared" data-testid="gauntlet-cleared">
      <div>
        <strong>Gauntlet cleared.</strong>
        <span>
          {{ nextGauntlet ? `${nextGauntlet.name} is open.` : 'There is nothing left below this floor.' }}
        </span>
      </div>
      <button
        v-if="nextGauntlet"
        type="button"
        class="btn-arcade btn-arcade--gold"
        data-testid="next-gauntlet-btn"
        @click="openGauntlet(nextGauntlet.id)"
      >
        Enter {{ nextGauntlet.name }} ▸
      </button>
      <button v-else type="button" class="btn-arcade" @click="openDungeon">
        Back to the Map
      </button>
    </section>

    <ol class="trial-list" :style="{ '--gauntlet-accent': selectedGauntlet.accent }">
      <li v-for="entry in trials" :key="entry.trial.id">
        <button
          type="button"
          class="trial-card"
          :class="{
            'trial-card--cleared': entry.cleared,
            'trial-card--locked': !entry.unlocked,
            'trial-card--finale': entry.finale,
          }"
          :disabled="!entry.unlocked"
          :data-testid="`trial-${entry.trial.id}`"
          @click="startDungeonTrial(selectedGauntlet.id, entry.trial.id)"
        >
          <span class="trial-card__top">
            <span class="trial-card__number">{{ entry.number }}</span>
            <DifficultyChip :difficulty="entry.trial.difficulty" compact />
            <span v-if="entry.finale" class="trial-card__finale">GATEKEEPER</span>
            <span class="trial-card__status">{{ trialStatus(entry) }}</span>
          </span>

          <span class="trial-card__title">{{ entry.trial.title }}</span>
          <span class="trial-card__blurb">{{ entry.trial.blurb }}</span>

          <span v-if="entry.puzzle" class="trial-card__stats">
            <span>
              <em>Cards</em>
              <strong>{{ entry.puzzle.settings.numCards }}</strong>
            </span>
            <span>
              <em>Target</em>
              <strong>
                {{ entry.unlocked ? formatNumber(entry.puzzle.targetExact ?? entry.puzzle.target) : '???' }}
              </strong>
            </span>
            <span>
              <em>Operators</em>
              <strong>{{ entry.puzzle.operatorGroups.length }}</strong>
            </span>
          </span>

          <span v-if="entry.puzzle?.bindLabels.length" class="trial-card__binds">
            {{ entry.puzzle.bindLabels.join(' · ') }}
          </span>

          <span class="trial-card__foot">
            <span v-if="entry.unlocked" class="trial-card__ledger">
              <template v-if="entry.revealed">Solution seen</template>
              <template v-else-if="entry.best !== null">
                Best <strong>{{ formatNumber(entry.best) }}</strong>
              </template>
              <template v-else>No score yet</template>
            </span>
            <span v-else class="trial-card__ledger">Clear the trial above to open this one.</span>
            <span class="trial-card__cta">
              {{ entry.cleared ? 'Replay ▸' : entry.unlocked ? 'Enter ▸' : 'Locked' }}
            </span>
          </span>
        </button>
      </li>
    </ol>
  </main>

  <main v-else class="screen-gauntlet screen-gauntlet--missing">
    <p>That gauntlet is not on the map.</p>
    <button type="button" class="btn-arcade" @click="openDungeon">Back to the Dungeon</button>
  </main>

  <GauntletLoreDialog
    v-if="loreOpen && selectedGauntlet"
    :gauntlet-id="selectedGauntlet.id"
    @close="closeLore"
  />
</template>

<style scoped>
.screen-gauntlet {
  --gauntlet-accent: var(--gold);
  flex: 1;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px 20px 42px;
}

.screen-gauntlet--missing {
  display: grid;
  place-content: center;
  gap: 16px;
  text-align: center;
  font-family: var(--font-mono);
  color: var(--ink-muted);
}

.gauntlet-marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--gauntlet-accent) 14%, transparent), transparent 46%),
    linear-gradient(180deg, #241a34, #171226);
  border: 4px solid var(--gauntlet-accent);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.12),
    0 8px 0 #09080f;
  padding: 10px 14px;
  margin-bottom: 18px;
}

.gauntlet-marquee__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.gauntlet-marquee__badge {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.16em;
  background: #0b0912;
  color: var(--gauntlet-accent);
  border: 2px solid color-mix(in srgb, var(--gauntlet-accent) 55%, transparent);
  padding: 4px 8px;
}

.gauntlet-marquee__name {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--ink-cream);
  text-shadow: 0 3px 0 #09080f;
}

.gauntlet-marquee__group {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--ink-muted);
}

.gauntlet-marquee__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gauntlet-lore-btn {
  border-color: color-mix(in srgb, var(--gauntlet-accent) 70%, #f8f2e0);
  color: color-mix(in srgb, var(--gauntlet-accent) 72%, #fff);
}

.gauntlet-lore-btn:hover:not(:disabled) {
  border-color: var(--gauntlet-accent);
  background: color-mix(in srgb, var(--gauntlet-accent) 18%, #38324f);
}

.gauntlet-hero {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) 260px;
  gap: 18px;
  align-items: center;
  padding: 6px 4px 22px;
}

.gauntlet-hero__sigil {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  font-size: 2.4rem;
  line-height: 1;
  color: var(--gauntlet-accent);
  background: rgba(9, 8, 15, 0.55);
  border: 3px solid color-mix(in srgb, var(--gauntlet-accent) 55%, transparent);
  outline: 3px solid #09080f;
  text-shadow: 0 4px 0 #09080f;
}

.gauntlet-hero h1 {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 3vw, 1.9rem);
  line-height: 1.25;
  color: var(--ink-cream);
  text-shadow: 0 4px 0 #09080f;
}

.gauntlet-hero__theme {
  margin: 0 0 8px;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  color: var(--gauntlet-accent);
}

.gauntlet-hero__intro {
  max-width: 62ch;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.98rem;
  line-height: 1.38;
  color: var(--ink-muted);
}

.gauntlet-hero__progress {
  background: #13101c;
  border: 3px solid #3c3357;
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  padding: 10px 12px;
}

.gauntlet-hero__count {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  color: var(--gauntlet-accent);
}

.gauntlet-hero__count strong {
  font-family: var(--font-mono);
  font-size: 1.2rem;
  font-weight: 400;
  letter-spacing: 0;
  color: #fff;
}

.gauntlet-hero__bar {
  height: 10px;
  margin: 8px 0;
  background: #09080f;
  border: 2px solid #2a2438;
  overflow: hidden;
}

.gauntlet-hero__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, color-mix(in srgb, var(--gauntlet-accent) 55%, #000), var(--gauntlet-accent));
  transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.gauntlet-hero__difficulty {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  color: var(--ink-muted);
}

.gauntlet-cleared {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 12px 14px;
  background:
    linear-gradient(90deg, rgba(111, 214, 138, 0.14), transparent 60%),
    #13101c;
  border: 3px solid rgba(111, 214, 138, 0.55);
  outline: 3px solid #09080f;
  box-shadow: 0 6px 0 #09080f;
  animation: balatro-pop 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.gauntlet-cleared strong {
  display: block;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 400;
  color: #b8f5c8;
}

.gauntlet-cleared span {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--ink-muted);
}

.trial-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trial-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 14px 15px 13px;
  text-align: left;
  color: inherit;
  background: linear-gradient(180deg, #211a30 0%, #120f1c 100%);
  border: 3px solid #3c3357;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 0 34px rgba(255, 255, 255, 0.03),
    0 7px 0 #09080f;
  cursor: pointer;
  transition:
    transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.trial-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: #3c3357;
}

.trial-card--cleared::before {
  background: #6fd68a;
}

.trial-card--finale::before {
  background: var(--gauntlet-accent);
}

.trial-card:hover:not(:disabled),
.trial-card:focus-visible {
  transform: translateY(-4px);
  border-color: var(--gauntlet-accent);
  box-shadow:
    inset 0 0 34px rgba(255, 255, 255, 0.05),
    0 11px 0 #09080f,
    0 0 22px color-mix(in srgb, var(--gauntlet-accent) 24%, transparent);
}

.trial-card:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #09080f;
}

.trial-card--locked {
  filter: saturate(0.35) brightness(0.72);
  cursor: not-allowed;
}

.trial-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.trial-card__number {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--gauntlet-accent);
  text-shadow: 0 2px 0 #09080f;
}

.trial-card__finale {
  padding: 2px 6px;
  font-family: var(--font-pixel);
  font-size: 0.44rem;
  letter-spacing: 0.12em;
  color: var(--gauntlet-accent);
  border: 1px solid color-mix(in srgb, var(--gauntlet-accent) 55%, transparent);
  background: color-mix(in srgb, var(--gauntlet-accent) 8%, transparent);
}

.trial-card__status {
  margin-left: auto;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.14em;
  color: var(--ink-muted);
}

.trial-card--cleared .trial-card__status {
  color: #6fd68a;
}

.trial-card__title {
  font-family: var(--font-display);
  font-size: 1rem;
  line-height: 1.25;
  color: var(--gold-bright);
}

.trial-card--finale .trial-card__title {
  color: var(--gauntlet-accent);
}

.trial-card__blurb {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.32;
  color: rgba(247, 240, 224, 0.72);
}

.trial-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 2px;
}

.trial-card__stats > span {
  min-width: 0;
  background: #0e0c15;
  border: 1px solid rgba(242, 201, 76, 0.2);
  padding: 5px 7px;
}

.trial-card__stats em {
  display: block;
  font-style: normal;
  font-family: var(--font-pixel);
  font-size: 0.44rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.trial-card__stats strong {
  display: block;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 400;
  color: #fff;
  overflow-wrap: anywhere;
}

.trial-card__binds {
  font-family: var(--font-pixel);
  font-size: 0.46rem;
  letter-spacing: 0.06em;
  line-height: 1.5;
  color: #6fd68a;
}

.trial-card__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 7px;
  border-top: 2px dashed rgba(242, 201, 76, 0.18);
}

.trial-card__ledger {
  font-family: var(--font-mono);
  font-size: 0.86rem;
  color: var(--ink-muted);
}

.trial-card__ledger strong {
  color: #72efdd;
}

.trial-card__cta {
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.1em;
  color: var(--gauntlet-accent);
  white-space: nowrap;
}

@media (max-width: 900px) {
  .gauntlet-hero {
    grid-template-columns: 64px minmax(0, 1fr);
  }
  .gauntlet-hero__sigil {
    width: 62px;
    height: 62px;
    font-size: 2rem;
  }
  .gauntlet-hero__progress {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .trial-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .screen-gauntlet {
    padding: 12px 12px 32px;
  }
  .gauntlet-hero {
    grid-template-columns: 1fr;
  }
  .gauntlet-hero__sigil {
    display: none;
  }
}
</style>
