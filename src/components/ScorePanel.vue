<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatNumber } from '../engine/math'

const props = defineProps<{
  roundNumber: number
  target: number
  approximationPercent: number
  /** Value of the single combined group, or null while cards remain unmerged. */
  value: number | null
  /** Signed error vs target, when a single group exists. */
  errorPercent: number | null
  score: number | null
  acceptable: boolean
  groupsLeft: number
  groupsTotal: number
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

const shownValue = useTweenedNumber(() => props.value ?? 0)
const accuracy = computed(() => {
  if (props.value === null || props.errorPercent === null) return 0
  return Math.max(0, Math.min(100, 100 - Math.abs(props.errorPercent)))
})
const shownAccuracy = useTweenedNumber(() => accuracy.value, 460)

const meterWidth = computed(() => `${Math.max(0, Math.min(100, accuracy.value))}%`)
const rangeLabel = computed(() => {
  if (props.approximationPercent > 0 && props.target !== 0) {
    const spread = (Math.abs(props.target) * props.approximationPercent) / 100
    return `±${props.approximationPercent}% · ${formatNumber(
      props.target - spread
    )}–${formatNumber(props.target + spread)}`
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
      <div class="blind-card__target" data-testid="target-display">{{ formatNumber(target) }}</div>
      <div class="blind-card__caption">TARGET</div>
      <div class="blind-card__range">{{ rangeLabel }}</div>
    </div>

    <!-- Score cluster: value chip × accuracy chip -->
    <div class="score-cluster" :class="{ 'score-cluster--hot': acceptable }">
      <div class="score-cluster__title">ACCURACY</div>

      <div class="chips-row">
        <div
          class="pixel-chip pixel-chip--value"
          :class="{ 'pixel-chip--muted': value === null }"
          data-testid="value-chip"
        >
          <span class="pixel-chip__num">{{ formatNumber(Math.round(shownValue * 10) / 10) }}</span>
        </div>
        <span class="chips-row__x">×</span>
        <div
          class="pixel-chip pixel-chip--mult"
          :class="{ 'pixel-chip--muted': value === null }"
          data-testid="accuracy-chip"
        >
          <span class="pixel-chip__num">{{ Math.round(shownAccuracy) }}%</span>
        </div>
      </div>
      <div class="chips-captions">
        <span>VALUE</span>
        <span>ACCURACY</span>
      </div>

      <div class="accuracy-meter" role="progressbar" :aria-valuenow="Math.round(accuracy)" aria-valuemin="0" aria-valuemax="100">
        <div class="accuracy-meter__fill" :class="{ 'accuracy-meter__fill--hot': acceptable }" :style="{ width: meterWidth }"></div>
        <div class="accuracy-meter__ticks"></div>
      </div>

      <div class="cluster-stats">
        <div class="cluster-stat">
          <span class="cluster-stat__label">COST</span>
          <span class="cluster-stat__value">{{ score === null ? '—' : score }}<em>pts</em></span>
        </div>
        <div class="cluster-stat">
          <span class="cluster-stat__label">GROUPS</span>
          <span class="cluster-stat__value">{{ groupsLeft }}<em>/{{ groupsTotal }}</em></span>
        </div>
      </div>

      <div class="cluster-status" :class="acceptable ? 'cluster-status--good' : 'cluster-status--idle'">
        {{ acceptable ? 'TARGET HIT' : value === null ? 'MERGE ALL CARDS' : 'KEEP TUNING' }}
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

.chips-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.chips-row__x {
  font-family: var(--font-pixel);
  font-size: 1rem;
  color: var(--ink-cream);
  text-shadow: 0 2px 0 #000;
  padding-bottom: 2px;
}

.pixel-chip {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
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

.pixel-chip--value {
  background: linear-gradient(180deg, #3b7ddd 0%, #2755a8 100%);
  transform: rotate(-1.5deg);
}

.pixel-chip--mult {
  background: linear-gradient(180deg, #ff6b52 0%, #c92f24 100%);
  transform: rotate(1.5deg);
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

.chips-captions {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.16em;
  color: var(--ink-muted);
}

.accuracy-meter {
  position: relative;
  height: 14px;
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

.cluster-stats {
  display: flex;
  gap: 6px;
}

.cluster-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #0c0a12;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 6px;
}

.cluster-stat__label {
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  color: var(--ink-muted);
}

.cluster-stat__value {
  font-family: var(--font-mono);
  font-size: 1.16rem;
  line-height: 1;
  color: var(--gold-bright);
}

.cluster-stat__value em {
  font-style: normal;
  font-size: 0.72rem;
  color: var(--ink-muted);
  margin-left: 2px;
}

.cluster-status {
  text-align: center;
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  padding: 5px 4px;
  border: 2px solid;
}

.cluster-status--idle {
  color: var(--ink-muted);
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
}

.cluster-status--good {
  color: #15111e;
  background: var(--gold);
  border-color: #fff9db;
  animation: status-blink 1.1s steps(2) infinite;
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

@keyframes status-blink {
  50% {
    background: var(--gold-bright);
  }
}

@media (prefers-reduced-motion: reduce) {
  .blind-card,
  .pixel-chip,
  .cluster-status {
    animation: none !important;
  }
  .burst-particle {
    display: none;
  }
}
</style>
