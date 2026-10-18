<script setup lang="ts">
import LobbyFrame from '../LobbyFrame.vue'
import { useGameContext } from '../../app/context'
import { lobbyModeLabel, lobbyPhaseLabel } from '../../app/labels'
import { multiplayer as multiplayerSession } from '../../multiplayer/session'

const {
  playerName,
  lobbyCodeInput,
  newLobbyIsPublic,
  creatingLobby,
  joiningLobby,
  connectionLine,
  createTable,
  joinTableByCode,
} = useGameContext()
</script>

<template>
<LobbyFrame badge="MULTIPLAYER" title="Find a Table" back-test-id="browser-back-btn">

  <div class="browser-grid">
    <section class="panel-box browser-card">
      <h2>Your Player</h2>

      <label class="mp-field browser-name">
        <span>Display name</span>
        <input
          v-model="playerName"
          type="text"
          class="input-arcade"
          maxlength="18"
          data-testid="mp-name-input"
        />
      </label>

      <div class="browser-create">
        <h3>Open a new table</h3>
        <div class="visibility-toggle" role="group" aria-label="Lobby visibility">
          <button
            type="button"
            class="visibility-option"
            :class="{ 'visibility-option--active': newLobbyIsPublic }"
            :aria-pressed="newLobbyIsPublic"
            data-testid="lobby-public-btn"
            @click="newLobbyIsPublic = true"
          >
            <span class="visibility-option__title">PUBLIC</span>
            <span class="visibility-option__copy">Listed for anyone to join</span>
          </button>
          <button
            type="button"
            class="visibility-option"
            :class="{ 'visibility-option--active': !newLobbyIsPublic }"
            :aria-pressed="!newLobbyIsPublic"
            data-testid="lobby-private-btn"
            @click="newLobbyIsPublic = false"
          >
            <span class="visibility-option__title">PRIVATE</span>
            <span class="visibility-option__copy">Code only, hidden from the list</span>
          </button>
        </div>
        <button
          type="button"
          class="btn-arcade btn-arcade--gold btn-arcade--block"
          data-testid="lobby-create-btn"
          :disabled="creatingLobby || multiplayerSession.status === 'connecting'"
          @click="createTable"
        >
          {{ creatingLobby ? 'Opening…' : 'Create Lobby' }}
        </button>
        <p class="browser-hint">
          You become the host. Every lobby gets its own short code other players can type in.
        </p>
      </div>

      <div class="browser-join">
        <h3>Join with a code</h3>
        <div class="browser-join__row">
          <input
            v-model="lobbyCodeInput"
            type="text"
            class="input-arcade browser-code-input"
            maxlength="12"
            placeholder="ABCD"
            aria-label="Lobby code"
            data-testid="mp-room-input"
            @keyup.enter="joinTableByCode()"
          />
          <button
            type="button"
            class="btn-arcade"
            data-testid="mp-join-btn"
            :disabled="joiningLobby || !lobbyCodeInput.trim()"
            @click="joinTableByCode()"
          >
            Join
          </button>
        </div>
      </div>

      <p
        class="mp-status"
        :class="`mp-status--${multiplayerSession.status}`"
        data-testid="mp-status"
      >
        {{ connectionLine }}
      </p>
      <p v-if="multiplayerSession.error" class="browser-error" role="alert">
        ⚠ {{ multiplayerSession.error }}
      </p>
    </section>

    <section class="panel-box browser-card browser-card--list">
      <div class="browser-list-head">
        <h2>Public Lobbies</h2>
        <span class="browser-count">{{ multiplayerSession.lobbies.length }}</span>
      </div>

      <div v-if="multiplayerSession.lobbies.length > 0" class="lobby-list" data-testid="lobby-list">
        <div
          v-for="lobby in multiplayerSession.lobbies"
          :key="lobby.code"
          class="lobby-row"
          :data-testid="`lobby-row-${lobby.code}`"
        >
          <span class="lobby-row__code">{{ lobby.code }}</span>
          <div class="lobby-row__info">
            <span class="lobby-row__host">{{ lobby.hostName }}</span>
            <span class="lobby-row__meta">
              {{ lobbyPhaseLabel(lobby.phase) }} · {{ lobbyModeLabel(lobby.mode) }}
            </span>
          </div>
          <span class="lobby-row__seats">
            {{ lobby.playerCount }}/{{ lobby.maxPlayers }}
          </span>
          <button
            type="button"
            class="btn-arcade btn-arcade--tiny"
            :disabled="lobby.playerCount >= lobby.maxPlayers"
            @click="joinTableByCode(lobby.code)"
          >
            {{ lobby.playerCount >= lobby.maxPlayers ? 'Full' : 'Join' }}
          </button>
        </div>
      </div>

      <div v-else class="lobby-empty">
        <p v-if="multiplayerSession.status === 'connecting'">Reading the lobby board…</p>
        <p v-else-if="multiplayerSession.status === 'error'">
          No table server answered. Start it with <code>npm run dev:server</code>.
        </p>
        <p v-else>
          No public lobbies are open. Create one, or ask a friend for their private code.
        </p>
      </div>
    </section>
  </div>
</LobbyFrame>
</template>

<style scoped>
/* ------------------------- lobby selector (multiplayer) ------------------------- */
.browser-grid {
  display: grid;
  grid-template-columns: 0.95fr 1.05fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 900px) {
    .browser-grid {
      grid-template-columns: 1fr;
    }
}

.browser-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: linear-gradient(180deg, #201a2e 0%, #15111f 100%);
}

.browser-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold);
  text-shadow: 0 3px 0 #09080f;
}

.browser-card h3 {
  margin: 0 0 10px;
  font-family: var(--font-pixel);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 240, 224, 0.6);
}

.browser-name {
  max-width: none;
}

.browser-create,
.browser-join {
  border-top: 2px dashed rgba(242, 201, 76, 0.22);
  padding-top: 14px;
}

.visibility-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.visibility-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  background: #120f18;
  border: 2px solid rgba(242, 201, 76, 0.3);
  padding: 10px;
  color: rgba(247, 240, 224, 0.65);
  cursor: pointer;
  transition: border-color 0.1s ease, background 0.1s ease;
}

.visibility-option:hover {
  border-color: rgba(242, 201, 76, 0.7);
}

.visibility-option--active {
  background: rgba(255, 190, 11, 0.14);
  border-color: var(--gold);
  box-shadow: inset 0 0 0 1px rgba(255, 190, 11, 0.35);
}

.visibility-option__title {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
}

.visibility-option__copy {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.2;
}

.browser-join__row {
  display: flex;
  gap: 8px;
}

.browser-code-input {
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  text-align: center;
}

.browser-code-input::placeholder {
  color: rgba(247, 240, 224, 0.2);
  letter-spacing: 0.32em;
}

.browser-error {
  margin: 0;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: #ffb2b2;
  background: rgba(254, 74, 73, 0.12);
  border-left: 3px solid var(--crimson);
}

.browser-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.browser-count {
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  color: #15111e;
  background: var(--gold);
  padding: 3px 8px;
}

.lobby-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.lobby-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  background: #241f30;
  border: 1px solid rgba(242, 201, 76, 0.35);
  padding: 9px 12px;
}

.lobby-row__code {
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
  background: #0b0912;
  border: 2px solid rgba(242, 201, 76, 0.4);
  padding: 5px 7px;
}

.lobby-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lobby-row__host {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby-row__meta {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: rgba(247, 240, 224, 0.5);
}

.lobby-row__seats {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: #72efdd;
}

.lobby-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 18px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.4;
  color: rgba(247, 240, 224, 0.5);
  border: 2px dashed rgba(242, 201, 76, 0.22);
}
</style>
