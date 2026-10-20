<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DEFAULT_DECIMAL_PLACES,
  MAX_DECIMAL_PLACES,
  decimalPlaces,
  resetDecimalPlaces,
} from '../app/displayPrecision'
import { fittedFontSize, formatPercent, formatScore, scoringModeLabel } from '../app/labels'
import { toDecimal } from '../engine/decimal'
import { formatNumber, type ScoreBreakdown } from '../engine/math'
import type { ConstantInfo } from '../engine/constants'
import type { SolutionScoringMode } from '../engine/types'

const props = defineProps<{
  roundNumber: number
  target: number
  /** Canonical target string; constants carry more digits than `target`. */
  targetExact?: string | null
  /** Named famous constant behind the target, when the table deals one. */
  constant?: ConstantInfo | null
  approximationPercent: number
  scoringMode: SolutionScoringMode
  /** Value of the single combined group, or null while cards remain unmerged. */
  value: number | null
  /** Signed error vs target, when a single group exists. */
  errorPercent: number | null
  acceptable: boolean
  /** Itemised cost of the current solution, or null while cards remain unmerged. */
  costBreakdown: ScoreBreakdown | null
  /** Bumped by the parent each time the target is hit, to fire the celebration. */
  hitSignal: number
}>()

const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Smooth count-up/count-down tween, the way Balatro's chips tick to their value. */
function useTweenedNumber(source: () => number, duration = 380) {
  const shown = ref(source())
  let raf = 0

  watch(
    source,
    (next) => {
      cancelAnimationFrame(raf)
      const from = shown.value
      const delta = next - from
      if (Math.abs(delta) < 0.0001) {
        shown.value = next
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        shown.value = from + delta * eased
        if (t < 1) {
          raf = requestAnimationFrame(step)
        }
      }
      raf = requestAnimationFrame(step)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
  })

  return shown
}

const exactTarget = computed(() => props.targetExact ?? String(props.target))
const targetText = computed(() => formatNumber(exactTarget.value, decimalPlaces.value))
const targetRef = ref<HTMLElement | null>(null)

/**
 * High-precision targets can be much wider than the blind card. Start from the
 * card's designed font size and shrink only when the number would spill out.
 */
function fitTargetNumber(): void {
  const el = targetRef.value
  if (!el) return
  el.style.removeProperty('font-size')
  const base = Number.parseFloat(getComputedStyle(el).fontSize)
  const fitted = fittedFontSize(base, el.clientWidth, el.scrollWidth)
  if (fitted !== null) el.style.fontSize = `${fitted}px`
}

watch(targetText, fitTargetNumber, { flush: 'post' })

let fitFrame = 0
function handleTargetResize(): void {
  if (fitFrame) cancelAnimationFrame(fitFrame)
  fitFrame = requestAnimationFrame(fitTargetNumber)
}

onMounted(() => {
  fitTargetNumber()
  window.addEventListener('resize', handleTargetResize)
  // The pixel font swaps in after first paint; re-fit once its metrics are real.
  if (document.fonts?.ready) void document.fonts.ready.then(fitTargetNumber)
})

const accuracy = computed(() => {
  if (props.value === null || props.errorPercent === null) return 0
  return Math.max(0, Math.min(100, 100 - Math.abs(props.errorPercent)))
})
const shownAccuracy = useTweenedNumber(() => accuracy.value, 460)

const meterWidth = computed(() => `${Math.max(0, Math.min(100, accuracy.value))}%`)
const rangeLabel = computed(() => {
  const target = toDecimal(exactTarget.value)
  if (props.approximationPercent > 0 && !target.isZero()) {
    const spread = target.abs().mul(props.approximationPercent).div(100)
    return `±${props.approximationPercent}% · ${formatNumber(
      target.minus(spread),
      decimalPlaces.value
    )}–${formatNumber(target.add(spread), decimalPlaces.value)}`
  }
  return 'EXACT MATCH · 0% ERROR'
})

/* ------------------------------ target-hit burst ------------------------------ */
interface Particle {
  id: number
  x: number
  y: number
  rot: number
  delay: number
  hue: string
}

const burst = ref(false)
const particles = ref<Particle[]>([])
let burstTimer: ReturnType<typeof setTimeout> | null = null
let particleSeed = 0

function fireBurst(): void {
  burst.value = true
  if (reducedMotion) {
    particles.value = []
  } else {
    const palette = ['#ffbe0b', '#ffe169', '#fe4a49', '#72efdd', '#f8f2e0']
    particles.value = Array.from({ length: 16 }, () => {
      const angle = Math.random() * Math.PI * 2
      const distance = 60 + Math.random() * 90
      return {
        id: particleSeed++,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 20,
        rot: Math.random() * 320 - 160,
        delay: Math.random() * 120,
        hue: palette[Math.floor(Math.random() * palette.length)]!,
      }
    })
  }
  if (burstTimer) clearTimeout(burstTimer)
  burstTimer = setTimeout(() => {
    burst.value = false
    particles.value = []
  }, 1250)
}

watch(
  () => props.hitSignal,
  (next, prev) => {
    if (next > prev) fireBurst()
  }
)

onBeforeUnmount(() => {
  if (burstTimer) clearTimeout(burstTimer)
  window.removeEventListener('resize', handleTargetResize)
  if (fitFrame) cancelAnimationFrame(fitFrame)
})
</script>

<template>
  <aside class="blind-sidebar" aria-label="Round status">
    <!-- Balatro-style blind card: the number you must reach -->
    <div class="blind-card" :class="{ 'blind-card--hot': acceptable }">
      <div class="blind-card__marquee">
        <span>ROUND {{ roundNumber }}</span>
        <span class="blind-card__suit">♠</span>
      </div>
      <div ref="targetRef" class="blind-card__target" data-testid="target-display">
        {{ targetText }}
      </div>
      <div class="blind-card__caption">TARGET</div>
      <div v-if="constant" class="blind-card__constant" data-testid="constant-display">
        <span class="blind-card__constant-head">
          <span class="blind-card__constant-symbol">{{ constant.symbol }}</span>
          <span class="blind-card__constant-name">{{ constant.name }}</span>
        </span>
        <span class="blind-card__constant-desc">{{ constant.description }}</span>
      </div>
      <div class="blind-card__range">{{ rangeLabel }}</div>
    </div>

    <!-- Display precision: the engine always carries full precision, this
         reveals as much of it as the player wants to inspect. -->
    <div class="precision-panel" data-testid="precision-panel">
      <div class="precision-panel__head">
        <span class="precision-panel__title">DECIMALS</span>
        <span class="precision-panel__value" data-testid="precision-value">
          {{ decimalPlaces >= MAX_DECIMAL_PLACES ? 'ALL 32' : decimalPlaces }}
        </span>
      </div>
      <input
        v-model.number="decimalPlaces"
        class="precision-slider"
        data-testid="decimal-slider"
        type="range"
        min="0"
        :max="MAX_DECIMAL_PLACES"
        step="1"
        aria-label="Decimal places shown"
      />
      <div class="precision-panel__scale">
        <span>0</span>
        <button
          v-if="decimalPlaces !== DEFAULT_DECIMAL_PLACES"
          type="button"
          class="precision-panel__reset"
          data-testid="reset-decimals"
          @click="resetDecimalPlaces"
        >
          {{ DEFAULT_DECIMAL_PLACES }} DEFAULT
        </button>
        <span v-else class="precision-panel__default">DEFAULT</span>
        <span>32</span>
      </div>
    </div>

    <!-- Accuracy readout plus an itemised breakdown of the solution's cost -->
    <div class="score-cluster" :class="{ 'score-cluster--hot': acceptable }">
      <div class="score-cluster__title">ACCURACY</div>

      <div class="accuracy-row">
        <div
          class="pixel-chip pixel-chip--mult"
          :class="{ 'pixel-chip--muted': value === null }"
          data-testid="accuracy-chip"
        >
          <span class="pixel-chip__num">{{ Math.round(shownAccuracy) }}%</span>
        </div>
        <div
          class="accuracy-meter"
          role="progressbar"
          :aria-valuenow="Math.round(accuracy)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="accuracy-meter__fill"
            :class="{ 'accuracy-meter__fill--hot': acceptable }"
            :style="{ width: meterWidth }"
          ></div>
          <div class="accuracy-meter__ticks"></div>
        </div>
      </div>

      <div class="cost-block" :class="{ 'cost-block--idle': costBreakdown === null }">
        <div class="cost-total">
          <span class="cost-total__label">SCORE</span>
          <span class="cost-total__value" data-testid="cost-total">
            {{ formatScore(costBreakdown?.total ?? null) }}<em>pts</em>
          </span>
        </div>
        <div class="cost-rows" data-testid="cost-breakdown">
          <div class="cost-row">
            <span class="cost-row__label">BINARY</span>
            <span class="cost-row__count">×{{ costBreakdown?.binaryOperators ?? 0 }}</span>
            <span class="cost-row__pts">{{ costBreakdown?.binaryCost ?? 0 }}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row__label">UNARY</span>
            <span class="cost-row__count">×{{ costBreakdown?.unaryOperators ?? 0 }}</span>
            <span class="cost-row__pts">{{ costBreakdown?.unaryCost ?? 0 }}</span>
          </div>
          <div
            v-if="costBreakdown && costBreakdown.forbiddenCost > 0"
            class="cost-row cost-row--forbidden"
            data-testid="cost-forbidden"
          >
            <span class="cost-row__label">FORBID</span>
            <span class="cost-row__count">×{{ costBreakdown.forbiddenCount }}</span>
            <span class="cost-row__pts">{{ costBreakdown.forbiddenCost }}</span>
          </div>
          <div
            v-if="approximationPercent > 0"
            class="cost-row cost-row--accuracy"
            data-testid="cost-accuracy"
          >
            <span class="cost-row__label">ACCURACY</span>
            <span class="cost-row__count">
              {{ errorPercent === null ? '—' : formatPercent(Math.abs(errorPercent)) }}
            </span>
            <span class="cost-row__pts">{{ formatScore(costBreakdown?.accuracyCost ?? 0) }}</span>
          </div>
        </div>
        <div v-if="approximationPercent > 0" class="cost-mode" data-testid="scoring-mode">
          {{ scoringModeLabel(scoringMode) }}
        </div>
      </div>
    </div>

    <!-- Celebration layer -->
    <div class="burst-layer" aria-hidden="true">
      <span
        v-for="particle in particles"
        :key="particle.id"
        class="burst-particle"
        :style="{
          '--px': `${particle.x}px`,
          '--py': `${particle.y}px`,
          '--rot': `${particle.rot}deg`,
          '--delay': `${particle.delay}ms`,
          background: particle.hue,
        }"
      ></span>

      <Transition name="stamp">
        <div v-if="burst" class="target-stamp" data-testid="target-hit-stamp">
          <span class="target-stamp__title">TARGET<br />HIT!</span>
          <span class="target-stamp__sub">+1 PT</span>
        </div>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.blind-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* ---------------- Blind card ---------------- */
.blind-card {
  position: relative;
  background: linear-gradient(180deg, #2b1d1f 0%, #1c1013 100%);
  border: 4px solid var(--crimson-dark);
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.12),
    inset 0 -5px 0 rgba(0, 0, 0, 0.55),
    0 7px 0 #09080f;
  padding: 10px 12px 12px;
  overflow: hidden;
  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.16s ease;
}

.blind-card::before {
  /* chunky diagonal hatch, like Balatro's boss-blind back plate */
  content: '';
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.05) 0 6px,
    transparent 6px 12px
  );
  pointer-events: none;
}

.blind-card--hot {
  border-color: var(--gold);
  animation: blind-flex 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.blind-card__marquee {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0d0a11;
  border: 2px solid rgba(255, 190, 11, 0.45);
  padding: 3px 7px;
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  color: var(--gold);
}

.blind-card__suit {
  color: var(--crimson);
  font-size: 0.8rem;
}

.blind-card__target {
  position: relative;
  max-width: 100%;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 2.9rem;
  line-height: 1;
  text-align: center;
  color: var(--gold-bright);
  padding: 12px 0 2px;
  text-shadow:
    0 3px 0 #7a1212,
    0 6px 0 #09080f,
    0 0 18px rgba(255, 190, 11, 0.45);
  letter-spacing: -0.02em;
}

.blind-card__caption {
  position: relative;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.34em;
  color: #ffb3b3;
}

.blind-card__constant {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 7px 1px 0;
  padding: 5px 6px 6px;
  background: rgba(255, 190, 11, 0.08);
  border: 1px solid rgba(255, 190, 11, 0.3);
  text-align: center;
}

.blind-card__constant-head {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
}

.blind-card__constant-symbol {
  font-family: var(--font-display);
  font-size: 1.1rem;
  line-height: 1;
  color: var(--gold-bright);
}

.blind-card__constant-name {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  color: var(--ink-cream);
}

.blind-card__constant-desc {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  line-height: 1.2;
  color: var(--ink-muted);
}

.blind-card__range {
  position: relative;
  margin-top: 8px;
  border-top: 2px dashed rgba(255, 255, 255, 0.16);
  padding-top: 6px;
  font-family: var(--font-mono);
  font-size: 0.86rem;
  line-height: 1.15;
  text-align: center;
  color: var(--ink-cream);
}

/* ---------------- Display precision ---------------- */
.precision-panel {
  background: #13111c;
  border: 3px solid #3a3550;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.08),
    0 4px 0 #09080f;
  padding: 8px 10px 7px;
}

.precision-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.precision-panel__title {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.22em;
  color: var(--ink-muted);
}

.precision-panel__value {
  min-width: 54px;
  padding: 3px 5px 2px;
  border: 2px solid #09080f;
  background: var(--gold);
  color: #241703;
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.08em;
  text-align: center;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.24);
}

.precision-slider {
  display: block;
  width: 100%;
  height: 12px;
  appearance: none;
  -webkit-appearance: none;
  background: linear-gradient(90deg, #2d5a46 0%, #4f8f70 100%);
  border: 2px solid #09080f;
  box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.precision-slider:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 3px;
}

.precision-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 15px;
  height: 20px;
  margin-top: -6px;
  background: var(--gold-bright);
  border: 2px solid #09080f;
  box-shadow:
    inset 0 -4px 0 rgba(0, 0, 0, 0.25),
    0 2px 0 #09080f;
  cursor: grab;
}

.precision-slider::-moz-range-thumb {
  width: 15px;
  height: 20px;
  border: 2px solid #09080f;
  border-radius: 0;
  background: var(--gold-bright);
  box-shadow:
    inset 0 -4px 0 rgba(0, 0, 0, 0.25),
    0 2px 0 #09080f;
  cursor: grab;
}

.precision-panel__scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 3px;
  font-family: var(--font-pixel);
  font-size: 0.46rem;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
}

.precision-panel__default {
  opacity: 0.65;
}

.precision-panel__reset {
  padding: 2px 4px 1px;
  border: 1px solid rgba(255, 190, 11, 0.4);
  background: transparent;
  color: var(--gold-bright);
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.precision-panel__reset:hover,
.precision-panel__reset:focus-visible {
  background: rgba(255, 190, 11, 0.12);
  outline: none;
}

/* ---------------- Score cluster ---------------- */
.score-cluster {
  background: #13111c;
  border: 3px solid #3a3550;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.1),
    0 6px 0 #09080f;
  padding: 10px 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s ease;
}

.score-cluster--hot {
  border-color: var(--gold);
}

.score-cluster__title {
  font-family: var(--font-pixel);
  font-size: 0.6rem;
  letter-spacing: 0.3em;
  color: var(--ink-muted);
  text-align: center;
}

/* Accuracy reads as one line: the percentage chip beside its meter */
.accuracy-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pixel-chip {
  position: relative;
  flex: 0 0 auto;
  min-width: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 4px 6px;
  border: 3px solid #f8f2e0;
  outline: 3px solid #09080f;
  box-shadow:
    inset 0 -4px 0 rgba(0, 0, 0, 0.32),
    0 4px 0 #09080f;
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1), filter 0.15s ease;
}

.pixel-chip--mult {
  background: linear-gradient(180deg, #ff6b52 0%, #c92f24 100%);
  transform: rotate(-1.5deg);
}

.pixel-chip--muted {
  filter: grayscale(0.55) brightness(0.7);
}

.pixel-chip__num {
  font-family: var(--font-display);
  font-size: 1.1rem;
  line-height: 1;
  color: #fff;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accuracy-meter {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  background: #0a0810;
  border: 2px solid #3a3550;
  overflow: hidden;
}

.accuracy-meter__fill {
  height: 100%;
  width: 0;
  background: repeating-linear-gradient(
    90deg,
    #2ec4b6 0 6px,
    #1a8d84 6px 8px
  );
  box-shadow: 0 0 10px rgba(46, 196, 182, 0.6);
  transition: width 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.accuracy-meter__fill--hot {
  background: repeating-linear-gradient(90deg, #ffbe0b 0 6px, #ff8f00 6px 8px);
  box-shadow: 0 0 14px rgba(255, 190, 11, 0.85);
}

.accuracy-meter__ticks {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0 calc(10% - 1px),
    rgba(0, 0, 0, 0.55) calc(10% - 1px) 10%
  );
  pointer-events: none;
}

/* ---------------- Cost: total plus where each point came from ---------------- */
.cost-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: opacity 0.2s ease;
}

.cost-block--idle {
  opacity: 0.55;
}

.cost-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  background: #0c0a12;
  border: 2px solid rgba(255, 190, 11, 0.35);
  padding: 5px 8px 6px;
}

.cost-total__label {
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.22em;
  color: var(--ink-muted);
}

.cost-total__value {
  font-family: var(--font-mono);
  font-size: 1.34rem;
  line-height: 1;
  color: var(--gold-bright);
  text-shadow: 0 2px 0 #09080f;
}

.cost-total__value em {
  font-style: normal;
  font-size: 0.72rem;
  color: var(--ink-muted);
  margin-left: 3px;
}

.cost-rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cost-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: baseline;
  gap: 6px;
  padding: 3px 7px;
  background: rgba(12, 10, 18, 0.75);
  border-left: 3px solid rgba(255, 255, 255, 0.14);
}

.cost-row__label {
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  color: var(--ink-muted);
}

.cost-row__count {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: rgba(247, 240, 224, 0.6);
}

.cost-row__pts {
  min-width: 4ch;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  color: var(--ink-cream);
}

.cost-row--forbidden {
  border-left-color: var(--crimson);
}

.cost-row--forbidden .cost-row__pts {
  color: #ff9d9d;
}

.cost-row--accuracy {
  border-left-color: #72efdd;
}

.cost-row--accuracy .cost-row__pts {
  color: #9df5e8;
}

.cost-mode {
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.14em;
  text-align: right;
  color: rgba(247, 240, 224, 0.45);
  padding: 2px 2px 0;
}

/* ---------------- Celebration ---------------- */
.burst-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
}

.burst-particle {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 7px;
  height: 7px;
  border: 2px solid #09080f;
  animation: particle-fly 0.85s steps(12) forwards;
  animation-delay: var(--delay);
  opacity: 0;
}

.target-stamp {
  position: absolute;
  top: 34%;
  left: 50%;
  width: 160px;
  margin-left: -80px;
  background: var(--gold);
  border: 4px solid #fff9db;
  outline: 4px solid #09080f;
  box-shadow:
    0 8px 0 #09080f,
    0 0 0 8px rgba(9, 8, 15, 0.35);
  color: #15111e;
  text-align: center;
  padding: 8px 6px 9px;
  transform: rotate(-7deg);
}

.target-stamp__title {
  display: block;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1.15;
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55);
}

.target-stamp__sub {
  display: block;
  margin-top: 4px;
  font-family: var(--font-pixel);
  font-size: 0.66rem;
  letter-spacing: 0.22em;
  color: #7a1212;
}

.stamp-enter-active {
  animation: stamp-in 0.34s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.stamp-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.stamp-leave-to {
  opacity: 0;
  transform: translateY(-14px) rotate(-7deg) scale(0.92);
}

@keyframes stamp-in {
  0% {
    opacity: 0;
    transform: scale(1.9) rotate(-16deg);
  }
  70% {
    opacity: 1;
    transform: scale(0.94) rotate(-5deg);
  }
  100% {
    transform: scale(1) rotate(-7deg);
  }
}

@keyframes particle-fly {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--px), var(--py)) rotate(var(--rot)) scale(0.5);
  }
}

@keyframes blind-flex {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.06) rotate(-1.5deg);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .blind-card,
  .pixel-chip {
    animation: none !important;
  }
  .burst-particle {
    display: none;
  }
}

/* Stacked HUD on tablets: the sidebar is wide, so the two blocks sit side by
   side there too and keep the felt tall. */
@media (min-width: 700px) and (max-width: 1000px) {
  .blind-sidebar {
    flex-direction: row;
    align-items: stretch;
    gap: 10px;
  }
  .blind-card {
    flex: 1 1 0;
    min-width: 0;
  }
  .score-cluster {
    flex: 1.1 1 0;
    min-width: 0;
  }
}

/* Phones: keep the HUD vertical (a side-by-side pair is too narrow to read)
   but shave its height down so the felt still gets most of the screen. */
@media (max-width: 520px) {
  .blind-card {
    padding: 8px 10px 9px;
  }
  .blind-card__target {
    font-size: 2.2rem;
    padding: 6px 0 0;
  }
  .blind-card__range {
    margin-top: 5px;
    padding-top: 4px;
    font-size: 0.74rem;
  }
  .score-cluster {
    gap: 6px;
    padding: 8px 9px 9px;
  }
  .accuracy-row {
    gap: 6px;
  }
  .pixel-chip {
    min-width: 56px;
    padding: 6px 4px 5px;
  }
  .accuracy-meter {
    height: 20px;
  }
  .cost-total {
    padding: 4px 7px 5px;
  }
  .cost-total__value {
    white-space: nowrap;
  }
  /* Two source chips per row: four in a line would clip their values. */
  .cost-rows {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
  }
  .cost-row {
    min-width: 0;
    grid-template-columns: 1fr auto;
    gap: 3px;
    padding: 2px 5px;
  }
  .cost-row__label {
    font-size: 0.44rem;
    letter-spacing: 0.08em;
  }
  .cost-row__count {
    display: none;
  }
  .cost-row__pts {
    min-width: 0;
    font-size: 0.8rem;
  }
  /* A fourth chip joins the grid when approximations are on: keep it legible. */
  .cost-row--accuracy .cost-row__label {
    font-size: 0.4rem;
    letter-spacing: 0.02em;
  }
  .cost-mode {
    display: none;
  }
}

/* Very short sidebars: shave the cards down a little further before the HUD
   moves into its horizontal strip layout. */
@media (max-height: 620px) {
  .blind-card {
    padding: 7px 10px 8px;
  }
  .blind-card__target {
    font-size: 2.2rem;
    padding: 5px 0 0;
  }
  .blind-card__range {
    margin-top: 4px;
    padding-top: 3px;
    font-size: 0.78rem;
  }
  .score-cluster {
    gap: 6px;
    padding: 8px 9px 9px;
  }
  .cost-total {
    padding: 4px 7px 5px;
  }
  .cost-row {
    padding: 2px 6px;
  }
}

/* Short screens: lay the two HUD blocks side by side so the playing screen can
   keep its whole strip of controls above the felt. Narrow portrait screens keep
   the stacked pair — there is not enough width to read two blocks at once. */
@media (max-height: 560px) and (min-width: 520px) {
  .blind-sidebar {
    flex-direction: row;
    align-items: stretch;
    gap: 8px;
  }
  .blind-card {
    flex: 1 1 0;
    min-width: 0;
    padding: 6px 9px 8px;
  }
  .blind-card__target {
    font-size: clamp(1.6rem, 5.2vh, 2.2rem);
    padding: 5px 0 0;
  }
  .blind-card__range {
    margin-top: 4px;
    padding-top: 3px;
    font-size: 0.72rem;
  }
  .score-cluster {
    flex: 1.15 1 0;
    min-width: 0;
    gap: 5px;
    padding: 6px 8px 8px;
  }
  .cost-row {
    padding: 2px 6px;
  }
}
</style>
