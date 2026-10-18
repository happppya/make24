import { onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue'
import { WORKSPACE_COUNT } from '../engine/workspace'
import type { OperatorId, OperatorMeta, ScreenPhase, WorkspaceState } from '../engine/types'
import { opSlotFromCode } from './labels'

/** Digit keys pick operators and workspaces; Z/Y/U drive undo, redo and split. */
export function useHotkeys(deps: {
  phase: Ref<ScreenPhase>
  menuOpen: Ref<boolean>
  tutorialOpen: Ref<boolean>
  activeWorkspace: ComputedRef<WorkspaceState | undefined>
  unaryOperators: ComputedRef<OperatorMeta[]>
  binaryOperators: ComputedRef<OperatorMeta[]>
  handleEscape: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleUngroup: () => void
  handleApplyOperator: (opId: OperatorId) => void
  switchWorkspace: (index: number) => void
}) {
  const {
    phase,
    menuOpen,
    tutorialOpen,
    activeWorkspace,
    unaryOperators,
    binaryOperators,
    handleEscape,
    handleUndo,
    handleRedo,
    handleUngroup,
    handleApplyOperator,
    switchWorkspace,
  } = deps

  function handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()

    // Esc always works, even while typing in a settings field.
    if (key === 'escape') {
      e.preventDefault()
      handleEscape()
      return
    }

    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA')
    ) {
      return
    }

    if (menuOpen.value || tutorialOpen.value || phase.value !== 'playing') return

    if (key === 'z') {
      e.preventDefault()
      handleUndo()
      return
    }
    if (key === 'y') {
      e.preventDefault()
      handleRedo()
      return
    }
    if (key === 'u') {
      e.preventDefault()
      handleUngroup()
      return
    }
    // Digit keys: 1–0 applies a binary operator, Shift+1–0 a unary one.
    const slot = opSlotFromCode(e.code)
    if (slot !== null) {
      if (e.altKey) {
        if (slot < WORKSPACE_COUNT) {
          e.preventDefault()
          switchWorkspace(slot)
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return
      const ws = activeWorkspace.value
      if (!ws?.selectedGroupId) return
      const operators = e.shiftKey ? unaryOperators.value : binaryOperators.value
      const operator = operators[slot]
      if (!operator) return
      e.preventDefault()
      handleApplyOperator(operator.id)
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeyDown))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeyDown))

  return { handleKeyDown }
}
