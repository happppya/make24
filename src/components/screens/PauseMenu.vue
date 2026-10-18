<script setup lang="ts">
import { useGameContext } from '../../app/context'

const {
  phase,
  settings,
  menuOpen,
  closeMenu,
  menuGoToLobby,
  menuGoToTitle,
  sfxOn,
  onToggleSfx,
} = useGameContext()
</script>

<template>
<div
  v-if="menuOpen"
  class="pause-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Menu"
  data-testid="pause-menu"
  @click.self="closeMenu"
>
  <div class="pause-card">
    <div class="pause-card__marquee">
      <span class="pause-card__badge">
        {{
          phase === 'title'
            ? 'START SCREEN'
            : settings.isMultiplayer
              ? 'MULTIPLAYER'
              : 'SINGLEPLAYER'
        }}
      </span>
      <span class="pause-card__title">MENU</span>
    </div>

    <div class="pause-card__body">
      <button
        type="button"
        class="btn-arcade btn-arcade--gold btn-arcade--block"
        data-testid="menu-resume"
        @click="closeMenu"
      >
        Resume
      </button>
      <button
        type="button"
        class="btn-arcade btn-arcade--block"
        data-testid="menu-lobby"
        :disabled="phase === 'lobby'"
        @click="menuGoToLobby"
      >
        Lobby &amp; Settings
      </button>
      <button
        type="button"
        class="btn-arcade btn-arcade--block"
        data-testid="menu-title"
        @click="menuGoToTitle"
      >
        Main Menu
      </button>
      <button
        type="button"
        class="btn-arcade btn-arcade--block"
        :class="sfxOn ? 'btn-arcade--emerald' : ''"
        data-testid="menu-sfx"
        :aria-pressed="sfxOn"
        @click="onToggleSfx"
      >
        {{ sfxOn ? '♪ Sound On' : '♪ Sound Off' }}
      </button>
    </div>

    <div class="pause-card__hint">Esc to resume</div>
  </div>
</div>
</template>

<style scoped>
/* Esc menu overlay */
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(20, 16, 32, 0.74) 0%,
    rgba(6, 5, 10, 0.92) 100%
  );
  backdrop-filter: blur(2px);
}

.pause-card {
  width: min(340px, 100%);
  background: linear-gradient(180deg, #241a34 0%, #130f1e 100%);
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 40px rgba(255, 190, 11, 0.08),
    0 12px 0 #09080f;
  padding: 14px 16px 16px;
  animation: balatro-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.pause-card__marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.45);
  padding: 6px 9px;
  margin-bottom: 14px;
}

.pause-card__badge {
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.18em;
  color: var(--gold);
}

.pause-card__title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--gold-bright);
  letter-spacing: 0.08em;
}

.pause-card__body {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.pause-card__hint {
  margin-top: 12px;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.18em;
  color: var(--ink-muted);
}

@keyframes menu-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.pause-overlay {
  animation: menu-fade 0.14s ease-out;
}
</style>
