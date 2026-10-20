import { ref, watch } from 'vue'
import {
  DEFAULT_DECIMAL_PLACES,
  MAX_DECIMAL_PLACES,
  formatNumber,
  type NumericInput,
} from '../engine/decimal'

const STORAGE_KEY = 'make24-decimal-places'

function readStoredPlaces(): number {
  if (typeof window === 'undefined') return DEFAULT_DECIMAL_PLACES
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return DEFAULT_DECIMAL_PLACES
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_DECIMAL_PLACES
  return Math.min(MAX_DECIMAL_PLACES, Math.max(0, Math.round(parsed)))
}

/**
 * One shared display width for every number on the table. The engine always
 * carries full precision; this only controls how much of it is revealed.
 */
export const decimalPlaces = ref(readStoredPlaces())

watch(decimalPlaces, (value) => {
  if (typeof window === 'undefined') return
  const clamped = Math.min(MAX_DECIMAL_PLACES, Math.max(0, Math.round(value)))
  if (clamped !== value) decimalPlaces.value = clamped
  window.localStorage.setItem(STORAGE_KEY, String(clamped))
})

export function resetDecimalPlaces(): void {
  decimalPlaces.value = DEFAULT_DECIMAL_PLACES
}

/** Format a value using the current in-game display width. */
export function formatDisplayNumber(value: NumericInput): string {
  return formatNumber(value, decimalPlaces.value)
}

export { DEFAULT_DECIMAL_PLACES, MAX_DECIMAL_PLACES }
