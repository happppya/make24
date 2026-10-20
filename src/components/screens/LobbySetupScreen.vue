<script setup lang="ts">
import { computed } from 'vue'
import LobbyFrame from '../LobbyFrame.vue'
import { useGameContext } from '../../app/context'
import { scoringModeLabel } from '../../app/labels'
import { CONSTANT_CATALOG, constantById } from '../../engine/constants'
import { BIND_CARD_LIMITS, MAX_PER_DEAL_LIMIT, bindRuleLabels } from '../../engine/binds'
import {
  OPERATOR_GROUPS,
  isOperatorEnabled,
  type OperatorGroup,
} from '../../engine/math'
import type { BindKind, OperatorMeta } from '../../engine/types'
import { multiplayer as multiplayerSession, selfPlayer } from '../../multiplayer/session'

const {
  settings,
  players,
  multiplayerSeated,
  multiplayerHost,
  multiplayerReady,
  canEditSettings,
  awaitingNextDeal,
  toggleReady,
  leaveTable,
  startMatchFromLobby,
} = useGameContext()

const selectedConstant = computed(() =>
  settings.targetConstant === 'random' ? null : constantById(settings.targetConstant)
)

/**
 * Constants are irrational, so an exact target is unplayable. Landing on the
 * mode is an explicit choice, so give it a workable band unless one is set.
 */
function handleTargetPresetChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'constant' && settings.approximationPercent <= 0) {
    settings.approximationPercent = 2
  }
}

function isOpEnabled(op: OperatorMeta): boolean {
  return isOperatorEnabled(settings.allowedOperators, op)
}

function groupEnabled(group: OperatorGroup): boolean {
  return group.operators.every(isOpEnabled)
}

function groupIndeterminate(group: OperatorGroup): boolean {
  const on = group.operators.filter(isOpEnabled).length
  return on > 0 && on < group.operators.length
}

/** Group header switch: flips every operator in the group at once. */
function setGroupEnabled(group: OperatorGroup, event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  settings.allowedOperators[group.id] = enabled
  for (const op of group.operators) settings.allowedOperators.operators[op.id] = enabled
}

function setOperatorEnabled(op: OperatorMeta, event: Event): void {
  settings.allowedOperators.operators[op.id] = (event.target as HTMLInputElement).checked
}

const accuracyRuleBlurb = computed(() => {
  switch (settings.scoringMode) {
    case 'accuracy-first':
      return 'a full tolerance-band miss costs 100 pts, so precision can beat a cheaper board.'
    case 'balanced':
      return 'a full tolerance-band miss costs 30 pts, about one binary operator.'
    default:
      return 'operation cost decides; accuracy only breaks ties.'
  }
})

/** The house rules currently switched on, for the rules summary. */
const forbiddenMoveLabels = computed(() => {
  const labels: string[] = []
  if (settings.forbiddenMoves.factorialInvgamma) labels.push('! with Γ⁻¹')
  if (settings.forbiddenMoves.oneToPower) labels.push('1 to a power')
  return labels
})

const bindLabels = computed(() => bindRuleLabels(settings.binds))
const bindsConfigured = computed(
  () => settings.binds.dragon.enabled || settings.binds.rook.enabled
)
const bindPerDealOptions = Array.from({ length: MAX_PER_DEAL_LIMIT + 1 }, (_, index) => index)

/** Card counts a kind may ask for, bounded by its own engine limits. */
function bindCardOptions(kind: BindKind): number[] {
  const limits = BIND_CARD_LIMITS[kind]
  return Array.from({ length: limits.max - limits.min + 1 }, (_, index) => limits.min + index)
}

/** A maximum below the minimum is impossible, so the range follows the minimum. */
function bindMaxOptions(kind: BindKind): number[] {
  return bindCardOptions(kind).filter((count) => count >= settings.binds[kind].minCards)
}

function setBindMinCards(kind: BindKind, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  const rule = settings.binds[kind]
  rule.minCards = value
  if (rule.maxCards < value) rule.maxCards = value
}
</script>

<template>
<LobbyFrame
  :badge="settings.isMultiplayer ? 'MULTIPLAYER' : 'SINGLEPLAYER'"
  title="Table Setup"
  fill
>

  <div class="lobby-grid">
    <!-- Left column: Players & Match Controls -->
    <section class="panel-box lobby-players">
      <div class="section-header">
        <h2>{{ settings.isMultiplayer ? 'Multiplayer Lobby' : 'Singleplayer Setup' }}</h2>
      </div>

      <div class="lobby-players__body">
        <div class="player-list">
        <div v-for="player in players" :key="player.id" class="player-row">
          <div class="player-ident">
            <span class="player-badge">{{ player.isHost ? 'HOST' : 'PLAYER' }}</span>
            <span class="player-name">{{ player.name }}</span>
          </div>
          <div class="player-meta">
            <span
              class="player-ready"
              :class="{ 'player-ready--on': player.isHost || player.isReady }"
            >
              {{ player.isHost ? 'HOST' : player.isReady ? 'READY' : 'WAITING' }}
            </span>
            <span class="player-pts">{{ player.points }} / {{ settings.firstToPoints }} pts</span>
          </div>
        </div>
      </div>

      <div v-if="settings.isMultiplayer" class="mp-connect" data-testid="lobby-identity">
        <div class="lobby-code-block">
          <span class="lobby-code-block__label">Lobby join code</span>
          <span class="lobby-code-block__code" data-testid="lobby-code">
            {{ multiplayerSession.room?.code ?? '——' }}
          </span>
          <span
            class="lobby-code-block__visibility"
            :class="{ 'lobby-code-block__visibility--private': !multiplayerSession.room?.isPublic }"
          >
            {{ multiplayerSession.room?.isPublic ? 'PUBLIC' : 'PRIVATE' }}
          </span>
        </div>
        <p v-if="awaitingNextDeal" class="lobby-waiting-note" data-testid="lobby-waiting-note">
          A round is already running. You're dealt in on the next one.
        </p>
        <div class="mp-connect__actions">
          <button
            v-if="multiplayerSeated && !multiplayerHost"
            type="button"
            class="btn-arcade btn-arcade--tiny btn-arcade--gold"
            data-testid="mp-ready-btn"
            @click="toggleReady"
          >
            {{ selfPlayer?.isReady ? 'Not Ready' : 'Ready Up' }}
          </button>
          <button
            type="button"
            class="btn-arcade btn-arcade--tiny"
            data-testid="mp-leave-btn"
            @click="leaveTable"
          >
            Leave Lobby
          </button>
        </div>
      </div>

      <div class="scoring-summary-box">
        <h3>Scoring Rules (Lower is Better)</h3>
        <ul>
          <li><strong>+10 pts</strong> per binary operator used</li>
          <li>
            <strong>+10, +20, +30… pts</strong> for consecutive stacked unary operators
            (<code>o(o(x)) = 30</code>, <code>o(o(o(x))) = 60</code>; binary resets chain)
          </li>
          <li v-if="forbiddenMoveLabels.length" data-testid="forbidden-summary">
            <strong>+{{ settings.forbiddenMovePenalty }} pts</strong> each time a forbidden
            move is used ({{ forbiddenMoveLabels.join(', ') }})
          </li>
          <li v-else data-testid="forbidden-summary">Forbidden moves are off.</li>
          <li v-if="bindLabels.length" data-testid="bind-summary">
            <strong>Binds:</strong> {{ bindLabels.join(' · ') }} (cards × per deal) form
            free locked groups.
          </li>
          <li v-else-if="bindsConfigured" data-testid="bind-summary">
            Binds are enabled, but every per-deal cap is <strong>0</strong>, so none form.
          </li>
          <li v-else data-testid="bind-summary">Binds are off.</li>
          <li v-if="settings.approximationPercent > 0">
            <strong>{{ scoringModeLabel(settings.scoringMode) }}</strong> accuracy weighting:
            {{ accuracyRuleBlurb }}</li>
          <li v-else>
            Accuracy is not scored while Approximations is <strong>0%</strong>.
          </li>
        </ul>
      </div>
      </div>

      <div class="lobby-start-cta">
        <button
          type="button"
          class="btn-arcade btn-arcade--gold btn-start-game"
          data-testid="start-round-btn"
          :disabled="
            settings.isMultiplayer &&
            (!multiplayerHost || !multiplayerSeated || !multiplayerReady)
          "
          @click="startMatchFromLobby"
        >
          {{ settings.isMultiplayer && !multiplayerHost ? 'Waiting for Host' : 'Deal Cards & Start Match' }}
        </button>
      </div>
    </section>

    <!-- Right column: Full Game Settings per Spec -->
    <section class="panel-box lobby-settings">
      <h2>Table Settings</h2>

      <fieldset class="settings-form" :disabled="!canEditSettings">
      <section class="settings-section">
        <h3 class="settings-section__title">Deal &amp; match</h3>

        <!-- Mode (multiplayer only dropdown) -->
        <div v-if="settings.isMultiplayer" class="field-row">
          <label for="setting-mode">Mode</label>
          <select id="setting-mode" v-model="settings.mode" class="input-arcade">
            <option value="first-to-solve">First to solve</option>
            <option value="best-30s">Best in 30s</option>
            <option value="best-1m">Best in 1m</option>
            <option value="best-3m">Best in 3m</option>
            <option value="best-5m">Best in 5m</option>
            <option value="best-10m">Best in 10m</option>
          </select>
        </div>

        <!-- Number of cards -->
        <div class="field-row">
          <label for="setting-num-cards">Number of cards dealt</label>
          <input
            id="setting-num-cards"
            v-model.number="settings.numCards"
            type="number"
            min="2"
            max="10"
            class="input-arcade input-short"
          />
        </div>

        <!-- Card pool -->
        <div class="field-row">
          <label for="setting-pool">Card pool</label>
          <select id="setting-pool" v-model="settings.cardPool" class="input-arcade">
            <option value="1-deck">One deck (52 cards)</option>
            <option value="2-decks">Two decks (104 cards)</option>
            <option value="3-decks">Three decks (156 cards)</option>
            <option value="unlimited">
              Unlimited (with replacement, all ranks equally likely)
            </option>
          </select>
        </div>

        <!-- First to X points -->
        <div class="field-row">
          <label for="setting-first-to">First to X points wins match</label>
          <input
            id="setting-first-to"
            v-model.number="settings.firstToPoints"
            type="number"
            min="1"
            max="25"
            class="input-arcade input-short"
          />
        </div>
      </section>

      <section class="settings-section">
        <h3 class="settings-section__title">Target</h3>

        <!-- Target number preset -->
        <div class="field-row">
          <label for="setting-target">Target number</label>
          <select
            id="setting-target"
            v-model="settings.targetPreset"
            class="input-arcade"
            @change="handleTargetPresetChange"
          >
            <option value="just-24">Just 24 (Always 24)</option>
            <option value="small">Small numbers (1 – 100)</option>
            <option value="big">Big numbers (100 – 10000)</option>
            <option value="custom">Custom range (Min – Max)</option>
            <option value="manual">Exact target, chosen before each round</option>
            <option value="constant">Famous constants (π, e, γ…)</option>
          </select>
        </div>

        <!-- Famous constant picker -->
        <div v-if="settings.targetPreset === 'constant'" class="field-row constant-field">
          <label for="setting-constant">Constant</label>
          <select
            id="setting-constant"
            v-model="settings.targetConstant"
            class="input-arcade"
            data-testid="setting-constant"
          >
            <option value="random">Random each round</option>
            <option v-for="constant in CONSTANT_CATALOG" :key="constant.id" :value="constant.id">
              {{ constant.symbol }} — {{ constant.name }} ({{ constant.value.toPrecision(6) }})
            </option>
          </select>
          <p class="field-hint constant-preview" data-testid="constant-preview">
            <template v-if="selectedConstant">
              <strong>{{ selectedConstant.symbol }} {{ selectedConstant.name }}</strong> —
              {{ selectedConstant.description }}
            </template>
            <template v-else>
              Each round deals a famous constant, with its name and meaning shown in the HUD.
            </template>
          </p>
          <p class="field-hint">
            These are not whole numbers, so keep the approximation band above 0%.
          </p>
        </div>

        <!-- Custom range inputs -->
        <div v-if="settings.targetPreset === 'custom'" class="field-row field-subrow">
          <div>
            <label for="setting-custom-min">Minimum</label>
            <input
              id="setting-custom-min"
              v-model.number="settings.customMin"
              type="number"
              class="input-arcade input-short"
            />
          </div>
          <div>
            <label for="setting-custom-max">Maximum</label>
            <input
              id="setting-custom-max"
              v-model.number="settings.customMax"
              type="number"
              class="input-arcade input-short"
            />
          </div>
        </div>

        <!-- The exact number is chosen in the pre-round dialog, not here. -->
        <p
          v-if="settings.targetPreset === 'manual'"
          class="field-hint manual-target-hint"
          data-testid="manual-target-hint"
        >
          {{ canEditSettings ? 'You choose the exact number' : 'The host chooses the exact number' }}
          each time a round is dealt. Every player gets the same target.
        </p>

        <!-- Approximations (%) -->
        <div class="field-row">
          <label for="setting-approx">
            Approximations (% error allowed, inclusive)
          </label>
          <div class="inline-field">
            <input
              id="setting-approx"
              v-model.number="settings.approximationPercent"
              type="number"
              min="0"
              max="100"
              step="0.5"
              class="input-arcade input-short"
            />
            <span class="field-hint">%</span>
          </div>
        </div>

        <!-- How accuracy is traded against operator cost -->
        <div class="field-row">
          <label for="setting-scoring-mode">Accuracy weighting</label>
          <select
            id="setting-scoring-mode"
            v-model="settings.scoringMode"
            class="input-arcade"
            data-testid="setting-scoring-mode"
            :disabled="!(settings.approximationPercent > 0)"
          >
            <option value="cost-first">Cost first</option>
            <option value="balanced">Balanced</option>
            <option value="accuracy-first">Accuracy first</option>
          </select>
          <span class="field-hint">
            {{ settings.approximationPercent > 0 ? accuracyRuleBlurb : 'Set Approximations above 0% to score closeness.' }}
          </span>
        </div>
      </section>

      <section class="settings-section">
        <h3 class="settings-section__title">Opening binds</h3>

        <!-- Automatic opening binds -->
        <div class="field-row">
          <label>Binds</label>
          <div class="bind-grid" data-testid="bind-settings">
            <section
              class="bind-card"
              :class="{ 'bind-card--on': settings.binds.dragon.enabled }"
            >
              <label class="bind-card__head">
                <input
                  v-model="settings.binds.dragon.enabled"
                  type="checkbox"
                  data-testid="toggle-bind-dragon"
                />
                <span class="bind-card__priority">P1</span>
                <span class="bind-card__name">Dragon</span>
              </label>
              <p class="bind-card__hint">
                Consecutive ranks (A, 2, 3…) fuse into one product. Duplicate ranks keep
                one card free for a rook.
              </p>
              <div class="bind-card__limits">
                <label class="bind-card__count">
                  Cards in a row
                  <span class="bind-card__count-controls">
                    <select
                      :value="settings.binds.dragon.minCards"
                      class="input-arcade input-short"
                      data-testid="bind-dragon-min"
                      :disabled="!settings.binds.dragon.enabled"
                      @change="setBindMinCards('dragon', $event)"
                    >
                      <option v-for="count in bindCardOptions('dragon')" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                    to
                    <select
                      v-model.number="settings.binds.dragon.maxCards"
                      class="input-arcade input-short"
                      data-testid="bind-dragon-max"
                      :disabled="!settings.binds.dragon.enabled"
                    >
                      <option v-for="count in bindMaxOptions('dragon')" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                  </span>
                </label>
                <label class="bind-card__count">
                  Per deal
                  <span class="bind-card__count-controls">
                    <select
                      v-model.number="settings.binds.dragon.maxPerDeal"
                      class="input-arcade input-short"
                      data-testid="bind-dragon-per-deal"
                      :disabled="!settings.binds.dragon.enabled"
                    >
                      <option v-for="count in bindPerDealOptions" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                  </span>
                </label>
              </div>
            </section>

            <section class="bind-card" :class="{ 'bind-card--on': settings.binds.rook.enabled }">
              <label class="bind-card__head">
                <input
                  v-model="settings.binds.rook.enabled"
                  type="checkbox"
                  data-testid="toggle-bind-rook"
                />
                <span class="bind-card__priority bind-card__priority--rook">P2</span>
                <span class="bind-card__name">Rook</span>
              </label>
              <p class="bind-card__hint">
                Every copy of one rank fuses into one product. The rank with the most
                copies is taken first.
              </p>
              <div class="bind-card__limits">
                <label class="bind-card__count">
                  Cards in a stack
                  <span class="bind-card__count-controls">
                    <select
                      :value="settings.binds.rook.minCards"
                      class="input-arcade input-short"
                      data-testid="bind-rook-min"
                      :disabled="!settings.binds.rook.enabled"
                      @change="setBindMinCards('rook', $event)"
                    >
                      <option v-for="count in bindCardOptions('rook')" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                    to
                    <select
                      v-model.number="settings.binds.rook.maxCards"
                      class="input-arcade input-short"
                      data-testid="bind-rook-max"
                      :disabled="!settings.binds.rook.enabled"
                    >
                      <option v-for="count in bindMaxOptions('rook')" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                  </span>
                </label>
                <label class="bind-card__count">
                  Per deal
                  <span class="bind-card__count-controls">
                    <select
                      v-model.number="settings.binds.rook.maxPerDeal"
                      class="input-arcade input-short"
                      data-testid="bind-rook-per-deal"
                      :disabled="!settings.binds.rook.enabled"
                    >
                      <option v-for="count in bindPerDealOptions" :key="count" :value="count">
                        {{ count }}
                      </option>
                    </select>
                  </span>
                </label>
              </div>
            </section>
          </div>

          <span class="field-hint">
            Binds form automatically before play. Longer runs and stacks shrink to their
            maximum; their product is free, but a bind is locked and cannot be ungrouped.
          </span>
        </div>
      </section>

      <section class="settings-section">
        <h3 class="settings-section__title">Operators</h3>

        <!-- Allowed operators: group switch plus one switch per operator -->
        <div class="field-row">
          <label>Allowed operators</label>
          <div class="operator-groups">
            <section v-for="group in OPERATOR_GROUPS" :key="group.id" class="operator-group">
              <label class="operator-group__head">
                <input
                  type="checkbox"
                  :checked="groupEnabled(group)"
                  :indeterminate.prop="groupIndeterminate(group)"
                  :data-testid="`toggle-group-${group.id}`"
                  @change="setGroupEnabled(group, $event)"
                />
                <span class="operator-group__name">{{ group.label }}</span>
                <span class="operator-group__count">
                  {{ group.operators.filter(isOpEnabled).length }}/{{ group.operators.length }}
                </span>
              </label>
              <span class="operator-group__hint">{{ group.hint }}</span>
              <div class="operator-toggles">
                <label
                  v-for="op in group.operators"
                  :key="op.id"
                  class="toggle-chip"
                  :class="{ 'toggle-chip--on': isOpEnabled(op) }"
                  :title="op.description"
                >
                  <input
                    type="checkbox"
                    :checked="isOpEnabled(op)"
                    :aria-label="`${op.label} (${op.shortSymbol})`"
                    :data-testid="`toggle-op-${op.id}`"
                    @change="setOperatorEnabled(op, $event)"
                  />
                  <span>
                    <strong>{{ op.shortSymbol }}</strong>
                    <span class="toggle-chip__label">{{ op.label }}</span>
                  </span>
                </label>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h3 class="settings-section__title">House rules</h3>

        <!-- Forbidden moves: shortcut rules with one shared price -->
        <div class="field-row">
          <label>Forbidden moves</label>
          <div class="operator-toggles">
            <label class="toggle-chip">
              <input
                v-model="settings.forbiddenMoves.factorialInvgamma"
                type="checkbox"
                data-testid="forbid-factorial-invgamma"
              />
              <span>! nested with Γ⁻¹</span>
            </label>
            <label class="toggle-chip">
              <input
                v-model="settings.forbiddenMoves.oneToPower"
                type="checkbox"
                data-testid="forbid-one-to-power"
              />
              <span>1 to a power (1 ^ x)</span>
            </label>
          </div>
          <span class="field-hint">
            Each occurrence adds the penalty below to the solution's score.
          </span>
        </div>

        <div class="field-row">
          <label for="setting-forbidden-penalty">Penalty per forbidden move</label>
          <div class="inline-field">
            <input
              id="setting-forbidden-penalty"
              v-model.number="settings.forbiddenMovePenalty"
              type="number"
              min="0"
              max="9999"
              step="10"
              class="input-arcade input-short"
              data-testid="forbidden-penalty"
            />
            <span class="field-hint">pts</span>
          </div>
        </div>
      </section>
      </fieldset>
    </section>
  </div>
</LobbyFrame>
</template>

<style scoped>
.lobby-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 24px;
  flex: 1 1 auto;
  min-height: 0;
}

@media (max-width: 900px) {
    .lobby-grid {
      grid-template-columns: 1fr;
      flex: 0 0 auto;
    }
}

.lobby-code-block {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lobby-code-block__label {
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 240, 224, 0.55);
  width: 100%;
}

.lobby-code-block__code {
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  color: var(--gold-bright);
  text-shadow: 0 3px 0 #09080f;
  background: #0b0912;
  border: 3px solid var(--gold);
  padding: 8px 12px 8px 18px;
}

.lobby-code-block__visibility {
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  color: #0b0f14;
  background: #72efdd;
}

.lobby-code-block__visibility--private {
  color: #f8f2e0;
  background: #6b4b9b;
}

.lobby-waiting-note {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--gold-bright);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-header h2,
.lobby-settings h2 {
  margin: 0 0 14px;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold);
  text-shadow: 0 3px 0 #09080f;
}

.lobby-players,
.lobby-settings {
  background: linear-gradient(180deg, #201a2e 0%, #15111f 100%);
}

/* Both panels are fixed-height columns: the long part scrolls, the buttons
   that move the game along stay where they are. */
.lobby-players,
.lobby-settings {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.lobby-players .section-header,
.lobby-settings h2 {
  flex: 0 0 auto;
}

.lobby-players__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: #6b5a2c transparent;
}

.lobby-players__body .scoring-summary-box {
  margin-bottom: 0;
}

.lobby-start-cta {
  flex: 0 0 auto;
  padding-top: 14px;
}

.lobby-settings h2 {
  margin-bottom: 10px;
}

@media (max-width: 900px) {
  .lobby-players,
  .lobby-settings {
    overflow: visible;
  }
  .lobby-players__body,
  .settings-form {
    overflow: visible;
    padding-right: 0;
  }
}

/* Chunky scrollbars so they read as part of the cabinet rather than the OS. */
.lobby-players__body::-webkit-scrollbar,
.settings-form::-webkit-scrollbar {
  width: 8px;
}

.lobby-players__body::-webkit-scrollbar-track,
.settings-form::-webkit-scrollbar-track {
  background: #0d0b14;
}

.lobby-players__body::-webkit-scrollbar-thumb,
.settings-form::-webkit-scrollbar-thumb {
  background: #6b5a2c;
  border: 2px solid #0d0b14;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 9px 12px;
}

.player-ident {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-badge {
  background: var(--gold);
  color: #191521;
  font-size: 0.68rem;
  font-weight: 900;
  padding: 2px 6px;
}

.player-name {
  font-weight: 700;
}

.player-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-pts {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--gold);
}

.player-ready {
  font-family: var(--font-pixel);
  font-size: 0.5rem;
  letter-spacing: 0.06em;
  padding: 3px 6px;
  border: 1px solid rgba(242, 201, 76, 0.28);
  color: rgba(247, 240, 224, 0.5);
}

.player-ready--on {
  color: #0b0f14;
  background: #72efdd;
  border-color: #72efdd;
}

.mp-connect {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
  padding: 12px;
  border: 2px dashed rgba(242, 201, 76, 0.28);
  background: rgba(8, 10, 16, 0.45);
}

.mp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  font-family: var(--font-pixel);
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: rgba(247, 240, 224, 0.65);
}

.mp-connect__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

fieldset.settings-form {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: #6b5a2c transparent;
}

fieldset.settings-form:disabled {
  opacity: 0.55;
}

/* One titled block per subject, separated by a dashed rule, so the list reads
   as sections instead of one endless form. */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 2px dashed rgba(242, 201, 76, 0.22);
}

.settings-section:first-child {
  padding-top: 0;
  border-top: 0;
}

.settings-section__title {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold-bright);
}

.scoring-summary-box {
  background: rgba(12, 10, 18, 0.65);
  border-left: 4px solid var(--gold);
  padding: 12px 14px;
  margin-bottom: 18px;
  font-size: 0.86rem;
}

.scoring-summary-box h3 {
  margin: 0 0 8px;
  font-size: 0.92rem;
  color: var(--gold);
}

.scoring-summary-box ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-start-game {
  width: 100%;
  padding: 13px;
  font-size: 1.05rem;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 2px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row > label {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--gold);
}

.field-subrow {
  flex-direction: row;
  gap: 16px;
}

.constant-field {
  border-left: 3px solid rgba(255, 190, 11, 0.35);
  padding-left: 12px;
}

.constant-preview {
  line-height: 1.35;
}

.constant-preview strong {
  color: var(--gold-bright);
}

.manual-target-hint {
  margin: -4px 0 0;
  line-height: 1.4;
  border-left: 3px solid rgba(255, 190, 11, 0.35);
  padding-left: 10px;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operator-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.operator-group {
  background: rgba(12, 10, 18, 0.55);
  border: 1px solid rgba(242, 201, 76, 0.24);
  padding: 9px 10px 10px;
}

.operator-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  color: var(--gold-bright);
}

.operator-group__count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.operator-group__hint {
  display: block;
  margin: 3px 0 8px 24px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--ink-muted);
}

.operator-toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 6px;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 7px 9px;
  font-size: 0.84rem;
  cursor: pointer;
  opacity: 0.72;
}

.toggle-chip--on {
  opacity: 1;
  border-color: rgba(255, 190, 11, 0.68);
  background: #2a2338;
}

.toggle-chip__label {
  margin-left: 5px;
  font-size: 0.78rem;
  color: var(--ink-muted);
}

/* Bind rules: one priority card per kind, each with its own card range and cap. */
.bind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}

.bind-card {
  background: rgba(12, 10, 18, 0.6);
  border: 1px solid rgba(111, 214, 138, 0.22);
  padding: 9px 10px 10px;
  opacity: 0.68;
  transition: opacity 0.14s ease, border-color 0.14s ease, background 0.14s ease;
}

.bind-card--on {
  opacity: 1;
  border-color: rgba(111, 214, 138, 0.65);
  background: rgba(18, 38, 26, 0.55);
}

.bind-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: var(--font-pixel);
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  color: #b8f5c8;
}

.bind-card__priority {
  flex: none;
  font-size: 0.46rem;
  color: #0f1d14;
  background: #6fd68a;
  padding: 2px 4px;
}

.bind-card__priority--rook {
  background: #c3a6ff;
  color: #1a1226;
}

.bind-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bind-card__hint {
  margin: 5px 0 8px 24px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.3;
  color: var(--ink-muted);
}

.bind-card__limits {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-left: 24px;
}

.bind-card__count {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.bind-card__count-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bind-card__count .input-arcade {
  width: 54px;
  padding: 4px 6px;
}
</style>
