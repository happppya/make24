<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { assetUrl } from '../assetUrl'
import TutorialShot from './TutorialShot.vue'

/**
 * The player's guide. Thin on prose: each section answers one question, and the
 * figures are real screenshots with numbered callouts, so the guide keeps
 * matching the interface it describes.
 */
interface ShotPin {
  n: number
  x: number
  y: number
  label: string
}

interface Shot {
  src: string
  alt: string
  caption: string
  width: 'wide' | 'medium' | 'narrow'
  pins: ShotPin[]
}

type Block =
  | { t: 'p'; text: string }
  | { t: 'keys'; rows: Array<{ keys: string[]; does: string }> }
  | { t: 'ops'; rows: Array<{ sym: string; name: string; note: string }> }
  | { t: 'shot'; shot: keyof typeof shots }

interface Section {
  id: string
  n: string
  title: string
  blocks: Block[]
}

const shots = {
  board: {
    src: assetUrl('tutorial/board.png'),
    alt: 'Gameplay screenshot: four dealt cards with two merged into one group, a multiply operator armed, the operator rail on the right and the score sidebar on the left.',
    caption: 'A round in progress: two cards merged, another operator armed.',
    width: 'wide',
    pins: [
      { n: 1, x: 41.59, y: 40.88, label: 'Merged group; the header states its value' },
      { n: 2, x: 94.44, y: 60.56, label: 'Binary (B) and unary (U) operator rails' },
      { n: 3, x: 97.78, y: 4, label: 'Status ribbon: equation, cost, verdict' },
      { n: 4, x: 85.56, y: 94, label: 'Split, undo, redo, reset' },
      { n: 5, x: 30.16, y: 94.33, label: 'Pan readout, centre view, tidy' },
      { n: 6, x: 17.85, y: 54.86, label: 'Workspace list' },
    ],
  },
  hud: {
    src: assetUrl('tutorial/hud.png'),
    alt: 'Close-up of the score sidebar: round target 24, an accuracy chip at 71 percent, and a cost of 30 points split across three binary operators.',
    caption: 'The sidebar once every card is in one group.',
    width: 'narrow',
    pins: [
      { n: 1, x: 90.3, y: 25.35, label: 'Target and the error band in force' },
      { n: 2, x: 86.06, y: 64.44, label: 'How close the current value is' },
      { n: 3, x: 86.06, y: 83.06, label: 'Total cost, itemised by source' },
    ],
  },
  settings: {
    src: assetUrl('tutorial/settings.png'),
    alt: 'Multiplayer lobby settings panel listing mode, cards dealt, target number, approximations, card pool, first-to points and the operator toggles.',
    caption: 'Table settings, as the host sees them.',
    width: 'medium',
    pins: [
      { n: 1, x: 93.65, y: 14.61, label: 'Round mode (head to head only)' },
      { n: 2, x: 22, y: 25.34, label: 'Cards dealt to everyone' },
      { n: 3, x: 93.65, y: 36.07, label: 'Target: fixed 24, a range, exact, or a famous constant' },
      { n: 4, x: 22, y: 46.81, label: 'Approximation band, in percent' },
      { n: 5, x: 22, y: 68.27, label: 'Points that take the match' },
      { n: 6, x: 93.65, y: 94.16, label: 'Operator sets in play' },
    ],
  },
} satisfies Record<string, Shot>

const sections: Section[] = [
  {
    id: 'target',
    n: '01',
    title: 'Make the target',
    blocks: [
      {
        t: 'p',
        text: 'The goal of the game is to make the target number by combining all of your cards into one expression using operators like plus and divide. Whenever you use an operator to change the value of a card, it goes into a group with the total value shown above it. Once all cards are in one group, that is your final answer.',
      },
      {
        t: 'p',
        text: 'A valid solution has a final value that lands on the target number (or in the acceptable error range). Every card is used exactly once.',
      },
      {
        t: 'p',
        text: "In the famous-constants mode the target is a constant such as π, e or Euler's γ instead of a whole number. The HUD names the constant and explains what it is, and every round can deal a different one. Constants are irrational, so the error band does the real work here.",
      },
      {
        t: 'p',
        text: 'In exact-target tables the lobby does not ask for the number. The host is prompted for it right before each deal, and everyone plays the same target.',
      },
      {
        t: 'p',
        text: 'The engine keeps far more digits than the screen shows. By default values stop at five decimal places; the DECIMALS slider in the score sidebar reveals up to 32 on the target, every group header and the final result. The last stop reads ALL 32, and the reset control returns to five.',
      },
    ],
  },
  {
    id: 'expression',
    n: '02',
    title: 'Build an expression',
    blocks: [
      {
        t: 'p',
        text: 'To build an expression, select a card or group, and then select an operator. A unary operator (like factorial, highlighted in cyan) just needs one item to function. A binary operator (like plus) waits for you to select a second card. Then a group is made that wraps the card or cards with the final value shown above.',
      },
      {
        t: 'p',
        text: 'Order counts: the first piece is the left operand, so 3 − 5 is −2 while 5 − 3 is 2. Merged groups act like single cards, so groups combine with groups.',
      },
      {
        t: 'p',
        text: 'Press {U}, or use the button under a selected group, to split it back apart.',
      },
      { t: 'shot', shot: 'board' },
    ],
  },
  {
    id: 'board',
    n: '03',
    title: 'Work the board',
    blocks: [
      {
        t: 'p',
        text: 'Drag a piece to rearrange it, or drag empty felt to pan. {⌖} recentres the view and {▦} tidies the pieces into an even grid.',
      },
      {
        t: 'p',
        text: 'The ribbon above the felt counts the groups still loose; once one group remains it shows the finished equation, its cost and whether the target accepts it.',
      },
      {
        t: 'p',
        text: 'Bottom right: split, undo, redo, and reset to the dealt hand. {Z} and {Y} cover undo and redo from the keyboard.',
      },
    ],
  },
  {
    id: 'workspaces',
    n: '04',
    title: 'Five boards per round',
    blocks: [
      {
        t: 'p',
        text: 'The hand is dealt into five identical workspaces. Each keeps its own layout, selection and history, and saves itself as you go, so you can try a route, leave it, and come back.',
      },
      {
        t: 'p',
        text: 'Switch with {⌥1} to {⌥5} or the workspace list in the sidebar. It is the quickest way to compare two ideas about the same hand.',
      },
    ],
  },
  {
    id: 'cost',
    n: '05',
    title: 'Cost, not speed',
    blocks: [
      {
        t: 'p',
        text: 'Score is a price. Each binary operator costs 10. Unary layers cost 10, then 20, then 30 as they stack, and a binary in between resets the ladder. The host can also forbid shortcut moves — a factorial sitting directly on an inverse gamma, and 1 raised to a power — each costing a penalty that is 200 by default and set in the lobby.',
      },
      {
        t: 'p',
        text: 'The score ticks up as you build: binary, unary and forbidden-move costs are billed immediately across every group on the board, and accuracy joins the total once the cards form one group. When two boards both hit the target, the lower total wins.',
      },
      {
        t: 'p',
        text: 'Accuracy starts as a filter: with the band at 1%, anything within 1% of the target counts as a hit. The host can also make closeness matter, choosing cost-first, balanced or accuracy-first so a nearer board pays a smaller accuracy penalty.',
      },
      {
        t: 'p',
        text: 'After a round, the winning board is replayed in card form beneath its equation, so you can see which cards were grouped and which operators produced each value.',
      },
      { t: 'shot', shot: 'hud' },
    ],
  },
  {
    id: 'rules',
    n: '06',
    title: 'Table rules',
    blocks: [
      {
        t: 'p',
        text: 'Settings live in the lobby. The host sets the mode, the cards dealt, the target (a fixed 24, a range, a per-round exact number, or a famous constant), the error band, the deck pool, the operator groups and individual operators, the forbidden moves and their penalty, and the points that win the match.',
      },
      {
        t: 'p',
        text: 'Binds are the other opening rule. Turn on Dragon to fuse consecutive ranks, Rook to fuse copies of one rank, or both; each one gets its own minimum and maximum card count plus its own cap of binds per deal. A bind becomes one free group whose value is the product of its cards. It is locked, so build with it rather than trying to split it.',
      },
      {
        t: 'p',
        text: 'Head to head, everyone gets the same hand. First-to-solve ends the round the moment a board is acceptable; the timed modes keep the cheapest board until the clock stops. Reach the target points and the match is over.',
      },
      {
        t: 'p',
        text: 'Ready up when you are set and the host deals. The host can also skip a round or end the match early.',
      },
      { t: 'shot', shot: 'settings' },
    ],
  },
  {
    id: 'operators',
    n: '07',
    title: 'Operators',
    blocks: [
      {
        t: 'p',
        text: 'The host can switch a whole group on at once or pick individual operators; whatever is enabled shows up on the rails. {1}–{0} pick a binary operator and {⇧1}–{⇧0} a unary one, counting down the rail; only the first ten of each get a digit key.',
      },
      {
        t: 'ops',
        rows: [
          { sym: '+ − × ÷', name: 'Basic', note: 'The first pick is the left operand, so 3 − 5 is −2.' },
          { sym: 'xʸ', name: 'Power', note: 'a to the power of b.' },
          { sym: 'ʸ√x', name: 'Root', note: 'a to the 1/b; odd roots accept negative cards.' },
          { sym: 'x!', name: 'Factorial', note: 'Γ(x + 1), so it also works off the integers.' },
          { sym: 'Γ(x)', name: 'Gamma', note: 'The continuous factorial: Γ(n) = (n − 1)!' },
          { sym: 'Γ⁻¹(x)', name: 'Inverse gamma', note: 'Principal branch; undefined at or below ≈0.8856.' },
          { sym: 'sin° cos° tan°', name: 'Trig', note: 'Angles are in degrees.' },
          { sym: '1/x', name: 'Inverse', note: 'One divided by x.' },
          { sym: '<< & | ⊕ ~', name: 'Binary computing', note: 'Whole numbers only: LSHIFT, AND, OR, XOR and NOT.' },
          {
            sym: '||',
            name: 'Concat',
            note: 'Joins the digits in selection order: 6 || 10 is 610, 10 || 6 is 106.',
          },
          {
            sym: 'eˣ ln logₐ',
            name: 'Analysis',
            note: 'e raised to x, the natural log, and log(a, b) with base a.',
          },
          {
            sym: 'C P S n!! !n',
            name: 'Combinatorics',
            note: 'Combinations, permutations, Stirling numbers, double factorial and derangements. Whole numbers only; results must stay exact.',
          },
        ],
      },
    ],
  },
  {
    id: 'keys',
    n: '08',
    title: 'Keys',
    blocks: [
      {
        t: 'keys',
        rows: [
          { keys: ['1', '0'], does: 'First ten binary operators, in rail order' },
          { keys: ['⇧1', '⇧0'], does: 'First ten unary operators, in rail order' },
          { keys: ['Z', 'Y'], does: 'Undo, redo' },
          { keys: ['U'], does: 'Split the selected group' },
          { keys: ['⌥1', '⌥5'], does: 'Switch workspace' },
          { keys: ['Esc'], does: 'Cancel a pending operator, or open the menu' },
        ],
      },
    ],
  },
]

const emit = defineEmits<{ (e: 'close'): void }>()

const scrollerRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
const activeId = ref(sections[0]!.id)

let observer: IntersectionObserver | null = null

/** Prose marks keys as {U}; split on those so they render as keycaps. */
function segments(text: string): Array<{ kbd?: string; text?: string }> {
  return text
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('{') ? { kbd: part.slice(1, -1) } : { text: part }))
}

function scrollToSection(id: string): void {
  activeId.value = id
  const scroller = scrollerRef.value
  const target = document.getElementById(`tutorial-${id}`)
  if (!scroller || !target) return
  // Measured against the scroller so the jump works whatever the offset parent
  // is; the easing comes from the scroller's CSS so reduced motion still wins.
  const top =
    target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  scroller.scrollTop = Math.max(0, top - 4)
}

onMounted(() => {
  closeRef.value?.focus()
  const root = scrollerRef.value
  if (!root || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      const id = (visible?.target as HTMLElement | undefined)?.dataset.section
      if (id) activeId.value = id
    },
    { root, rootMargin: '0px 0px -58% 0px', threshold: 0 }
  )
  root.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => observer!.observe(el))
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="tutorial-overlay" data-testid="tutorial-overlay" @click.self="emit('close')">
    <div
      class="manual"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      data-testid="tutorial-dialog"
    >
      <header class="manual__bar">
        <span class="manual__badge">Player’s guide</span>
        <h2 id="tutorial-title" class="manual__title">How to play</h2>
        <button
          ref="closeRef"
          type="button"
          class="manual__close"
          data-testid="tutorial-close"
          aria-label="Close tutorial"
          @click="emit('close')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="manual__body">
        <nav class="manual__rail" aria-label="Tutorial sections">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="rail-link"
            :class="{ 'rail-link--active': activeId === section.id }"
            :aria-current="activeId === section.id ? 'true' : undefined"
            :data-testid="`tutorial-nav-${section.id}`"
            @click="scrollToSection(section.id)"
          >
            <span class="rail-link__num">{{ section.n }}</span>
            <span class="rail-link__title">{{ section.title }}</span>
          </button>
        </nav>

        <div ref="scrollerRef" class="manual__scroll" data-testid="tutorial-scroll">
          <section
            v-for="section in sections"
            :id="`tutorial-${section.id}`"
            :key="section.id"
            class="section"
            :data-section="section.id"
            :aria-labelledby="`tutorial-heading-${section.id}`"
          >
            <div class="section__head">
              <span class="section__num" aria-hidden="true">{{ section.n }}</span>
              <h3 :id="`tutorial-heading-${section.id}`">{{ section.title }}</h3>
            </div>

            <template v-for="(block, index) in section.blocks" :key="`${section.id}-${index}`">
              <p v-if="block.t === 'p'" class="section__p">
                <template v-for="(segment, part) in segments(block.text)" :key="part">
                  <kbd v-if="segment.kbd">{{ segment.kbd }}</kbd>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </p>

              <dl v-else-if="block.t === 'keys'" class="key-table">
                <template v-for="row in block.rows" :key="row.does">
                  <dt class="key-table__keys">
                    <kbd v-for="key in row.keys" :key="key">{{ key }}</kbd>
                  </dt>
                  <dd class="key-table__does">{{ row.does }}</dd>
                </template>
              </dl>

              <dl v-else-if="block.t === 'ops'" class="op-table">
                <template v-for="row in block.rows" :key="row.name">
                  <dt class="op-table__row">
                    <span class="op-table__sym">{{ row.sym }}</span>
                    <span class="op-table__name">{{ row.name }}</span>
                  </dt>
                  <dd class="op-table__note">{{ row.note }}</dd>
                </template>
              </dl>

              <TutorialShot
                v-else-if="block.t === 'shot'"
                :src="shots[block.shot].src"
                :alt="shots[block.shot].alt"
                :caption="shots[block.shot].caption"
                :pins="shots[block.shot].pins"
                :width="shots[block.shot].width"
              />
            </template>
          </section>
        </div>
      </div>

      <footer class="manual__foot">
        <span class="manual__foot-hint">Scroll for the rest of the guide</span>
        <span class="manual__foot-keys"><kbd>Esc</kbd> closes</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 9600;
  display: grid;
  place-items: center;
  padding: 20px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(20, 16, 32, 0.78) 0%,
    rgba(5, 4, 9, 0.95) 100%
  );
  backdrop-filter: blur(3px);
}

.manual {
  display: flex;
  flex-direction: column;
  width: min(1120px, 100%);
  max-height: min(92vh, 940px);
  background: #131020;
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    0 14px 0 #09080f,
    inset 0 0 70px rgba(255, 190, 11, 0.06);
  animation: balatro-pop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.manual__bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #251a37 0%, #140f22 100%);
  border-bottom: 3px solid var(--gold);
}

.manual__badge {
  flex: 0 0 auto;
  padding: 5px 8px;
  background: var(--crimson);
  border: 2px solid #fff3e6;
  color: #fff;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 2px 0 #7a1212;
}

.manual__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.92rem;
  line-height: 1.4;
  color: var(--gold-bright);
  text-shadow: 0 2px 0 #09080f;
  text-transform: uppercase;
}

.manual__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  background: #241d38;
  color: var(--ink-cream);
  border: 3px solid var(--ink-cream);
  outline: 3px solid #09080f;
  font-family: var(--font-pixel);
  font-size: 0.8rem;
  cursor: pointer;
  box-shadow: 0 4px 0 #09080f;
}

.manual__close:hover,
.manual__close:focus-visible {
  background: var(--crimson);
  border-color: #fff3e6;
}

.manual__close:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #09080f;
}

.manual__body {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  min-height: 0;
  flex: 1 1 auto;
}

.manual__rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 10px;
  border-right: 3px solid rgba(255, 190, 11, 0.3);
  overflow-y: auto;
}

.rail-link {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  background: transparent;
  border: 2px solid transparent;
  color: var(--ink-muted);
  font-family: var(--font-pixel);
  font-size: 0.66rem;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.rail-link:hover {
  color: var(--ink-cream);
  border-color: rgba(255, 190, 11, 0.4);
}

.rail-link--active {
  background: var(--gold);
  border-color: #fff9db;
  outline: 2px solid #09080f;
  color: #15111e;
}

.rail-link--active .rail-link__num {
  color: #6c1f0c;
}

.rail-link:focus-visible {
  outline: 3px solid var(--gold-bright);
  outline-offset: 2px;
}

.rail-link__num {
  font-family: var(--font-display);
  font-size: 0.55rem;
  color: var(--crimson);
}

.rail-link__title {
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.manual__scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 28px 30px;
  scroll-behavior: smooth;
  background-image: radial-gradient(rgba(248, 242, 224, 0.05) 1px, transparent 1px);
  background-size: 16px 16px;
}

.manual__scroll::-webkit-scrollbar {
  width: 12px;
}

.manual__scroll::-webkit-scrollbar-track {
  background: #0c0a15;
  border-left: 2px solid rgba(255, 190, 11, 0.2);
}

.manual__scroll::-webkit-scrollbar-thumb {
  background: var(--gold);
  border: 2px solid #0c0a15;
}

.section {
  padding: 20px 0 26px;
  border-bottom: 2px dashed rgba(255, 190, 11, 0.2);
  scroll-margin-top: 6px;
}

.section:last-child {
  border-bottom: 0;
  padding-bottom: 8px;
}

.section__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.section__num {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--crimson);
}

.section h3 {
  margin: 0;
  font-family: var(--font-pixel);
  font-weight: 700;
  font-size: 1.18rem;
  letter-spacing: 0.02em;
  color: var(--gold-bright);
}

.section__p {
  margin: 12px 0 0;
  max-width: 68ch;
  font-family: var(--font-mono);
  font-size: 1.22rem;
  line-height: 1.38;
  color: #ece5d2;
}

kbd {
  display: inline-block;
  padding: 0 6px;
  margin: 0 1px;
  background: #221c33;
  border: 2px solid rgba(248, 242, 224, 0.34);
  border-bottom-width: 3px;
  color: var(--gold-bright);
  font-family: var(--font-pixel);
  font-size: 0.72rem;
  line-height: 1.5;
  vertical-align: baseline;
  white-space: nowrap;
}

.key-table {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 18px;
  margin: 14px 0 0;
  max-width: 62ch;
  align-items: center;
}

.key-table__keys {
  display: flex;
  gap: 4px;
  justify-self: start;
}

.key-table__does {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.12rem;
  line-height: 1.3;
  color: #ece5d2;
}

.op-table {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 9px 16px;
  margin: 14px 0 0;
  max-width: 70ch;
  align-items: baseline;
}

.op-table__row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
}

.op-table__sym {
  font-family: var(--font-mono);
  font-size: 1.16rem;
  color: var(--gold-bright);
  white-space: nowrap;
}

.op-table__name {
  font-family: var(--font-pixel);
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--ink-cream);
}

.op-table__note {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.08rem;
  line-height: 1.3;
  color: var(--ink-muted);
}

@media (max-width: 620px) {
  .op-table {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px 0;
  }

  .op-table__note {
    padding: 0 0 8px 12px;
  }
}

.manual__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-top: 3px solid rgba(255, 190, 11, 0.4);
  background: #0f0c19;
  font-family: var(--font-mono);
  font-size: 0.98rem;
  color: var(--ink-muted);
}

.manual__foot-keys {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 900px) {
  .tutorial-overlay {
    padding: 10px;
  }

  .manual {
    max-height: 94vh;
  }

  .manual__title {
    font-size: 0.78rem;
  }

  .manual__body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .manual__rail {
    flex-direction: row;
    gap: 6px;
    padding: 8px 10px;
    border-right: 0;
    border-bottom: 3px solid rgba(255, 190, 11, 0.3);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .rail-link {
    grid-template-columns: auto auto;
    flex: 0 0 auto;
    padding: 5px 8px;
    font-size: 0.6rem;
    white-space: nowrap;
  }

  .manual__scroll {
    padding: 4px 16px 24px;
  }

  .section__p {
    font-size: 1.14rem;
  }

  .manual__foot-hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .manual,
  .manual__scroll {
    animation: none;
    scroll-behavior: auto;
  }
}
</style>
