<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DUNGEON_GAUNTLETS, gauntletGroup } from '../engine/dungeon'

const props = defineProps<{ gauntletId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const startIndex = DUNGEON_GAUNTLETS.findIndex((gauntlet) => gauntlet.id === props.gauntletId)
const pageIndex = ref(startIndex >= 0 ? startIndex : 0)
const bodyRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)

const current = computed(() => DUNGEON_GAUNTLETS[pageIndex.value]!)
const group = computed(() => gauntletGroup(current.value.id)!)
const previous = computed(() => DUNGEON_GAUNTLETS[pageIndex.value - 1] ?? null)
const next = computed(() => DUNGEON_GAUNTLETS[pageIndex.value + 1] ?? null)
const fragment = computed(() => String(pageIndex.value + 1).padStart(2, '0'))
const total = DUNGEON_GAUNTLETS.length

watch(
  () => props.gauntletId,
  (id) => {
    const index = DUNGEON_GAUNTLETS.findIndex((gauntlet) => gauntlet.id === id)
    if (index >= 0) pageIndex.value = index
  }
)

watch(pageIndex, async () => {
  await nextTick()
  const body = bodyRef.value
  if (!body) return
  if (typeof body.scrollTo === 'function') {
    body.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    body.scrollTop = 0
  }
})

function turn(delta: number): void {
  const index = pageIndex.value + delta
  if (index < 0 || index >= total) return
  pageIndex.value = index
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    // The game-wide Esc handler would open the pause menu behind the reader.
    // Capture phase keeps this close local to the ledger.
    event.stopImmediatePropagation()
    emit('close')
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    turn(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    turn(1)
  }
}

onMounted(() => {
  closeRef.value?.focus()
  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="lore-overlay" data-testid="gauntlet-lore-overlay" @click.self="emit('close')">
    <article
      class="lore-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gauntlet-lore-title"
      :style="{ '--lore-accent': current.accent }"
      data-testid="gauntlet-lore-dialog"
    >
      <header class="lore-top">
        <div class="lore-top__chapter">
          <span class="lore-top__sigil" aria-hidden="true">{{ group.sigil }}</span>
          <span class="lore-top__chapter-copy">
            <span>{{ group.chapter }}</span>
            <strong>{{ group.name }}</strong>
          </span>
        </div>
        <span class="lore-top__fragment">Fragment {{ fragment }} / {{ total }}</span>
        <button
          ref="closeRef"
          type="button"
          class="lore-close"
          aria-label="Close lore"
          data-testid="gauntlet-lore-close"
          @click="emit('close')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="lore-body">
        <div class="lore-spine" aria-hidden="true">
          <span class="lore-spine__sigil">{{ current.sigil }}</span>
          <span class="lore-spine__number">{{ fragment }}</span>
          <span class="lore-spine__rule"></span>
          <span class="lore-spine__word">Ledger</span>
        </div>

        <div ref="bodyRef" class="lore-copy" data-testid="gauntlet-lore-body">
          <p class="lore-kicker">{{ current.name }}</p>
          <h2 id="gauntlet-lore-title">{{ current.lore.heading }}</h2>

          <blockquote class="lore-quote">
            <p>“{{ current.lore.epigraph }}”</p>
            <cite>{{ current.lore.source }}</cite>
          </blockquote>

          <p v-for="(paragraph, index) in current.lore.paragraphs" :key="index" class="lore-p">
            {{ paragraph }}
          </p>

          <p v-if="next" class="lore-thread">
            The ledger continues in <strong>{{ next.name }}</strong>.
          </p>
          <p v-else class="lore-thread">
            The ledger ends here. The next hand is yours.
          </p>
        </div>
      </div>

      <footer class="lore-nav">
        <button
          type="button"
          class="lore-turn lore-turn--prev"
          :disabled="!previous"
          data-testid="gauntlet-lore-prev"
          @click="turn(-1)"
        >
          <span aria-hidden="true">◂</span>
          <span class="lore-turn__label">{{ previous?.name ?? 'Start of the ledger' }}</span>
        </button>

        <span class="lore-nav__hint"><kbd>Esc</kbd> closes</span>

        <button
          type="button"
          class="lore-turn lore-turn--next"
          :disabled="!next"
          data-testid="gauntlet-lore-next"
          @click="turn(1)"
        >
          <span class="lore-turn__label">{{ next?.name ?? 'End of the ledger' }}</span>
          <span aria-hidden="true">▸</span>
        </button>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.lore-overlay {
  position: fixed;
  inset: 0;
  z-index: 9300;
  display: grid;
  place-items: center;
  padding: 22px;
  background: radial-gradient(
    circle at 50% 38%,
    rgba(20, 16, 32, 0.78) 0%,
    rgba(5, 4, 9, 0.96) 100%
  );
  backdrop-filter: blur(3px);
  animation: lore-fade 0.16s ease-out;
}

.lore-page {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(940px, 100%);
  max-height: min(91vh, 900px);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--lore-accent) 10%, transparent), transparent 30%),
    linear-gradient(180deg, #221a30 0%, #110e1a 74%);
  border: 4px solid var(--lore-accent);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 90px rgba(0, 0, 0, 0.26),
    0 14px 0 #09080f;
  animation: lore-pop 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.lore-top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 12px;
  background: #0b0912;
  border-bottom: 3px solid color-mix(in srgb, var(--lore-accent) 62%, #2a2438);
}

.lore-top__chapter {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.lore-top__sigil {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  color: var(--lore-accent);
  border: 2px solid color-mix(in srgb, var(--lore-accent) 55%, transparent);
  font-size: 1rem;
  line-height: 1;
  text-shadow: 0 2px 0 #09080f;
}

.lore-top__chapter-copy {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--lore-accent) 74%, #fff);
  white-space: nowrap;
}

.lore-top__chapter-copy strong {
  overflow: hidden;
  max-width: 28ch;
  font-weight: 400;
  color: var(--ink-cream);
  text-overflow: ellipsis;
}

.lore-top__fragment {
  margin-left: auto;
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.16em;
  color: var(--ink-muted);
  white-space: nowrap;
}

.lore-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  background: #241d38;
  color: var(--ink-cream);
  border: 3px solid var(--ink-cream);
  outline: 3px solid #09080f;
  font-family: var(--font-pixel);
  font-size: 0.74rem;
  cursor: pointer;
  box-shadow: 0 3px 0 #09080f;
}

.lore-close:hover,
.lore-close:focus-visible {
  background: var(--lore-accent);
  border-color: #fff;
  color: #15111e;
}

.lore-close:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #09080f;
}

.lore-body {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.lore-spine {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 22px 8px 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--lore-accent) 10%, transparent), transparent 70%),
    #0d0a15;
  border-right: 2px dashed color-mix(in srgb, var(--lore-accent) 34%, transparent);
}

.lore-spine__sigil {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  color: var(--lore-accent);
  background: rgba(9, 8, 15, 0.6);
  border: 3px solid color-mix(in srgb, var(--lore-accent) 55%, transparent);
  font-size: 1.8rem;
  line-height: 1;
  text-shadow: 0 4px 0 #09080f;
}

.lore-spine__number {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--ink-cream);
  text-shadow: 0 3px 0 #09080f;
}

.lore-spine__rule {
  width: 2px;
  flex: 1;
  min-height: 30px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lore-accent) 65%, transparent),
    transparent
  );
}

.lore-spine__word {
  writing-mode: vertical-rl;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  letter-spacing: 0.34em;
  color: color-mix(in srgb, var(--lore-accent) 55%, var(--ink-muted));
}

.lore-copy {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 34px 30px;
  background-image: linear-gradient(
    rgba(248, 242, 224, 0.055) 1px,
    transparent 1px
  );
  background-size: 100% 31px;
  scroll-behavior: smooth;
}

.lore-copy::-webkit-scrollbar {
  width: 12px;
}

.lore-copy::-webkit-scrollbar-track {
  background: #0c0a15;
  border-left: 2px solid color-mix(in srgb, var(--lore-accent) 20%, transparent);
}

.lore-copy::-webkit-scrollbar-thumb {
  background: var(--lore-accent);
  border: 2px solid #0c0a15;
}

.lore-kicker {
  margin: 0 0 5px;
  font-family: var(--font-pixel);
  font-size: 0.52rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--lore-accent);
}

.lore-copy h2 {
  margin: 0;
  max-width: 22ch;
  font-family: var(--font-display);
  font-size: clamp(1.05rem, 2.5vw, 1.55rem);
  font-weight: 400;
  line-height: 1.45;
  color: var(--ink-cream);
  text-shadow: 0 4px 0 #09080f;
}

.lore-quote {
  margin: 20px 0 18px;
  padding: 10px 0 10px 15px;
  border-left: 4px solid var(--lore-accent);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--lore-accent) 9%, transparent),
    transparent 80%
  );
}

.lore-quote p {
  margin: 0;
  max-width: 54ch;
  font-family: var(--font-mono);
  font-size: 1.22rem;
  line-height: 1.36;
  color: var(--ink-cream);
}

.lore-quote cite {
  display: block;
  margin-top: 5px;
  font-family: var(--font-pixel);
  font-size: 0.48rem;
  font-style: normal;
  letter-spacing: 0.1em;
  color: var(--ink-muted);
}

.lore-p {
  margin: 0 0 14px;
  max-width: 66ch;
  font-family: var(--font-mono);
  font-size: 1.18rem;
  line-height: 1.52;
  color: #e9e1cf;
}

.lore-thread {
  margin: 22px 0 0;
  padding-top: 11px;
  border-top: 2px dashed color-mix(in srgb, var(--lore-accent) 26%, transparent);
  font-family: var(--font-mono);
  font-size: 1.04rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.lore-thread strong {
  font-weight: 400;
  color: var(--lore-accent);
}

.lore-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: #0d0a15;
  border-top: 3px solid color-mix(in srgb, var(--lore-accent) 45%, #2a2438);
}

.lore-turn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 38%;
  min-width: 0;
  padding: 5px 9px;
  background: transparent;
  border: 2px solid transparent;
  color: var(--ink-muted);
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
}

.lore-turn:hover:not(:disabled),
.lore-turn:focus-visible {
  border-color: color-mix(in srgb, var(--lore-accent) 55%, transparent);
  color: var(--ink-cream);
}

.lore-turn:focus-visible {
  outline: 3px solid var(--lore-accent);
  outline-offset: 1px;
}

.lore-turn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.lore-turn--next {
  margin-left: auto;
  text-align: right;
}

.lore-turn__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lore-nav__hint {
  flex: none;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: rgba(247, 240, 224, 0.42);
}

kbd {
  display: inline-block;
  padding: 0 5px;
  background: #221c33;
  border: 2px solid rgba(248, 242, 224, 0.28);
  border-bottom-width: 3px;
  color: var(--lore-accent);
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  line-height: 1.5;
  vertical-align: baseline;
}

@keyframes lore-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes lore-pop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 760px) {
  .lore-overlay {
    padding: 10px;
  }

  .lore-page {
    max-height: 94vh;
  }

  .lore-body {
    grid-template-columns: 74px minmax(0, 1fr);
  }

  .lore-spine__sigil {
    width: 44px;
    height: 44px;
    font-size: 1.45rem;
  }

  .lore-copy {
    padding: 20px 20px 26px;
  }
}

@media (max-width: 560px) {
  .lore-top__chapter-copy strong,
  .lore-top__fragment {
    display: none;
  }

  .lore-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .lore-spine {
    display: none;
  }

  .lore-copy {
    padding: 18px 16px 24px;
  }

  .lore-copy h2 {
    max-width: 26ch;
    font-size: 1.02rem;
  }

  .lore-quote p {
    font-size: 1.1rem;
  }

  .lore-p {
    font-size: 1.1rem;
  }

  .lore-nav__hint {
    display: none;
  }

  .lore-turn {
    max-width: 47%;
    font-size: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lore-overlay,
  .lore-page {
    animation: none;
  }

  .lore-copy {
    scroll-behavior: auto;
  }
}
</style>
