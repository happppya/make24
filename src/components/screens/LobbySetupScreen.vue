<script setup lang="ts">
import LobbyFrame from '../LobbyFrame.vue'
import { useGameContext } from '../../app/context'
import { multiplayer as multiplayerSession, selfPlayer } from '../../multiplayer/session'

const {
  settings,
  players,
  multiplayerSeated,
  multiplayerHost,
  multiplayerReady,
  canEditSettings,
  connectionLine,
  awaitingNextDeal,
  toggleReady,
  leaveTable,
  startMatchFromLobby,
} = useGameContext()
</script>

<template>
<LobbyFrame :badge="settings.isMultiplayer ? 'MULTIPLAYER' : 'SINGLEPLAYER'" title="Table Setup">

  <div class="lobby-grid">
    <!-- Left column: Players & Match Controls -->
    <section class="panel-box lobby-players">
      <div class="section-header">
        <h2>{{ settings.isMultiplayer ? 'Multiplayer Lobby' : 'Singleplayer Setup' }}</h2>
      </div>

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
          <span class="lobby-code-block__label">Lobby code</span>
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
        <p class="browser-hint">
          {{
            multiplayerSession.room?.isPublic
              ? 'Listed in the public lobby browser.'
              : 'Hidden from the list — share the code to invite players.'
          }}
        </p>
        <p class="mp-status" :class="`mp-status--${multiplayerSession.status}`">
          {{ connectionLine }}
        </p>
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
          <li>
            <strong>+200 pts</strong> penalty each time <code>!</code> and
            <code>Γ⁻¹</code> are nested directly together
          </li>
        </ul>
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

        <!-- Target number preset -->
        <div class="field-row">
          <label for="setting-target">Target number</label>
          <select
            id="setting-target"
            v-model="settings.targetPreset"
            class="input-arcade"
          >
            <option value="just-24">Just 24 (Always 24)</option>
            <option value="small">Small numbers (1 – 100)</option>
            <option value="big">Big numbers (100 – 10000)</option>
            <option value="custom">Custom range (Min – Max)</option>
            <option value="manual">Host selects exact target number</option>
          </select>
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

        <!-- Host manual target input -->
        <div v-if="settings.targetPreset === 'manual'" class="field-row field-subrow">
          <div>
            <label for="setting-manual-target">Host Target Number</label>
            <input
              id="setting-manual-target"
              v-model.number="settings.manualTarget"
              type="number"
              class="input-arcade input-short"
            />
          </div>
        </div>

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

        <!-- Allowed operators -->
        <div class="field-row">
          <label>Allowed operators</label>
          <div class="operator-toggles">
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.basic" type="checkbox" />
              <span>Basic (+, −, ×, ÷)</span>
            </label>
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.powers" type="checkbox" />
              <span>Powers &amp; roots (xʸ, ʸ√x)</span>
            </label>
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.factorial" type="checkbox" />
              <span>Factorials &amp; gamma (x!, Γ(x), Γ⁻¹(x))</span>
            </label>
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.trig" type="checkbox" />
              <span>Basic trig in deg (sin°, cos°, tan°)</span>
            </label>
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.inverse" type="checkbox" />
              <span>Inverse (1/x)</span>
            </label>
            <label class="toggle-chip">
              <input v-model="settings.allowedOperators.bitshift" type="checkbox" />
              <span>Bit shifting (LSHIFT, RSHIFT)</span>
            </label>
            <label class="toggle-chip">
              <input
                v-model="settings.allowedOperators.concat"
                type="checkbox"
                data-testid="toggle-concat"
              />
              <span>Concatenate (||)</span>
            </label>
          </div>
        </div>
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
}

@media (max-width: 900px) {
    .lobby-grid {
      grid-template-columns: 1fr;
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
}

fieldset.settings-form:disabled {
  opacity: 0.55;
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
  gap: 14px;
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

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operator-toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.4);
  padding: 8px 10px;
  font-size: 0.84rem;
  cursor: pointer;
}
</style>
