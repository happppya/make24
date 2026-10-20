<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useGameContext } from '../../app/context'
import { MANUAL_TARGET_MAX, MANUAL_TARGET_MIN } from '../../engine/deck'

const {
  settings,
  targetPromptInitial,
  targetPromptRound,
  confirmTargetChoice,
  cancelTargetPrompt,
} = useGameContext()

const value = ref<string | number>(targetPromptInitial.value)
const error = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
  inputRef.value?.select()
})

function submit(): void {
  const raw = typeof value.value === 'string' ? value.value.trim() : value.value
  const target = Number(raw)
  if (raw === '' || !Number.isFinite(target)) {
    error.value = 'Enter a number for the target.'
    return
  }
  if (target < MANUAL_TARGET_MIN || target > MANUAL_TARGET_MAX) {
    error.value = `Use a target between ${MANUAL_TARGET_MIN} and ${MANUAL_TARGET_MAX}.`
    return
  }
  error.value = ''
  confirmTargetChoice(target)
}
</script>

<template>
  <div
    class="target-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="target-choice-title"
    data-testid="target-choice-dialog"
    @click.self="cancelTargetPrompt"
  >
    <form
      class="target-card"
      data-testid="target-choice-form"
      novalidate
      @submit.prevent="submit"
    >
      <div class="target-card__marquee">
        <span>ROUND {{ targetPromptRound }}</span>
        <span class="target-card__badge">
          {{ settings.isMultiplayer ? 'HOST DEAL' : 'SOLO DEAL' }}
        </span>
      </div>

      <h2 id="target-choice-title" class="target-card__title">SET THE TARGET</h2>
      <p class="target-card__blurb">
        Pick the exact number before the cards are dealt.
        {{ settings.isMultiplayer ? 'Every player gets the same target.' : '' }}
      </p>

      <label class="target-card__label" for="target-choice-input">Exact target</label>
      <input
        id="target-choice-input"
        ref="inputRef"
        v-model="value"
        type="number"
        inputmode="decimal"
        step="any"
        :min="MANUAL_TARGET_MIN"
        :max="MANUAL_TARGET_MAX"
        class="input-arcade target-card__input"
        data-testid="target-choice-input"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? 'target-choice-error' : undefined"
      />
      <p
        v-if="error"
        id="target-choice-error"
        class="target-card__error"
        role="alert"
        data-testid="target-choice-error"
      >
        {{ error }}
      </p>

      <div class="target-card__actions">
        <button
          type="submit"
          class="btn-arcade btn-arcade--gold"
          data-testid="target-choice-confirm"
        >
          {{ targetPromptRound === 1 ? 'Deal Cards' : 'Deal Next Round' }}
        </button>
        <button
          type="button"
          class="btn-arcade"
          data-testid="target-choice-cancel"
          @click="cancelTargetPrompt"
        >
          Cancel
        </button>
      </div>

      <div class="target-card__hint">Esc to cancel</div>
    </form>
  </div>
</template>

<style scoped>
.target-overlay {
  position: fixed;
  inset: 0;
  z-index: 9400;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(28, 20, 18, 0.72) 0%,
    rgba(6, 5, 10, 0.93) 100%
  );
  backdrop-filter: blur(2px);
  animation: target-fade 0.14s ease-out;
}

.target-card {
  width: min(390px, 100%);
  background:
    linear-gradient(180deg, #2c1f24 0%, #150f18 100%),
    repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 0 6px, transparent 6px 12px);
  border: 4px solid var(--gold);
  outline: 4px solid #09080f;
  box-shadow:
    inset 0 0 42px rgba(255, 190, 11, 0.09),
    0 12px 0 #09080f;
  padding: 14px 16px 16px;
  animation: target-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.target-card__marquee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #0b0912;
  border: 2px solid rgba(255, 190, 11, 0.45);
  padding: 6px 9px;
  font-family: var(--font-pixel);
  font-size: 0.54rem;
  letter-spacing: 0.18em;
  color: var(--gold);
}

.target-card__badge {
  color: var(--crimson);
}

.target-card__title {
  margin: 18px 0 6px;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.3rem;
  line-height: 1;
  color: var(--gold-bright);
  text-shadow: 0 4px 0 #09080f;
}

.target-card__blurb {
  margin: 0 0 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.96rem;
  line-height: 1.35;
  color: var(--ink-muted);
}

.target-card__label {
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}

.target-card__input {
  width: 100%;
  font-family: var(--font-display);
  font-size: 1.5rem;
  text-align: center;
  padding: 10px;
  color: var(--gold-bright);
}

.target-card__error {
  margin: 8px 0 0;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  color: #ff9aa2;
}

.target-card__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.target-card__actions .btn-arcade {
  width: 100%;
}

.target-card__hint {
  margin-top: 12px;
  text-align: center;
  font-family: var(--font-pixel);
  font-size: 0.56rem;
  letter-spacing: 0.18em;
  color: var(--ink-muted);
}

@keyframes target-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes target-pop {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
