import { onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { playSfx } from '../audio/sfx'
import {
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARD_SPACING_X,
  DEFAULT_CARD_SPACING_Y,
  bringGroupToFront,
  getGroupPosition,
  setGroupPosition,
  setWorkspacePan,
  tidyWorkspaceGroups,
} from '../engine/workspace'
import type { WorkspaceState } from '../engine/types'
import type { Juice } from './useJuice'

/** Dragging pieces and panning the felt, plus the tidy/recenter board tools. */
export interface DragInteraction {
  kind: 'group' | 'pan'
  groupId?: string
  startClientX: number
  startClientY: number
  initialX: number
  initialY: number
  moved: boolean
}

/** Gaps the tidy grid leaves between pieces, matching the dealt layout's pitch. */
const TIDY_GAP_X = 52
const TIDY_GAP_Y = 23

export function useBoardGestures(deps: {
  activeWorkspace: ComputedRef<WorkspaceState | undefined>
  viewportRef: Ref<HTMLElement | null>
  actionError: Ref<string | null>
  juice: Juice
}) {
  const { activeWorkspace, viewportRef, actionError, juice } = deps

  const activeDrag = ref<DragInteraction | null>(null)
  const hoveredPanLabel = ref<string | null>(null)
  /** While true the slots ease into a freshly tidied layout instead of teleporting. */
  const tidyingBoard = ref(false)

  let suppressNextSelectClick = false
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function handleGroupPointerDown(event: PointerEvent, groupId: string, idx: number): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const ws = activeWorkspace.value
    if (!ws) return
    event.stopPropagation()
    // Picking a piece up lifts it above its neighbours straight away, and it
    // stays there when dropped: a card dragged across another must not slide
    // back underneath it.
    bringGroupToFront(ws, groupId)
    const pos = getGroupPosition(ws, groupId, idx)
    activeDrag.value = {
      kind: 'group',
      groupId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialX: pos.x,
      initialY: pos.y,
      moved: false,
    }
  }

  function handleCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1 && event.pointerType === 'mouse') return
    const ws = activeWorkspace.value
    if (!ws) return
    activeDrag.value = {
      kind: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialX: ws.panX,
      initialY: ws.panY,
      moved: false,
    }
  }

  function handleWindowPointerMove(event: PointerEvent): void {
    const drag = activeDrag.value
    const ws = activeWorkspace.value
    if (!drag || !ws) return

    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true
    }
    if (!drag.moved) return

    if (drag.kind === 'group' && drag.groupId) {
      setGroupPosition(ws, drag.groupId, drag.initialX + dx, drag.initialY + dy)
    } else if (drag.kind === 'pan') {
      setWorkspacePan(ws, drag.initialX + dx, drag.initialY + dy)
    }
  }

  function handleWindowPointerUp(): void {
    const drag = activeDrag.value
    if (!drag) return
    if (drag.kind === 'group' && drag.moved) {
      suppressNextSelectClick = true
      const timer = setTimeout(() => {
        suppressNextSelectClick = false
        timers.delete(timer)
      }, 0)
      timers.add(timer)
    }
    activeDrag.value = null
  }

  function handleCanvasWheel(event: WheelEvent): void {
    const ws = activeWorkspace.value
    if (!ws) return
    event.preventDefault()
    setWorkspacePan(ws, ws.panX - event.deltaX, ws.panY - event.deltaY)
  }

  function handleRecenterView(): void {
    const ws = activeWorkspace.value
    if (!ws) return
    // The plane is anchored at the viewport centre, so pan (0, 0) is the origin.
    setWorkspacePan(ws, 0, 0)
  }

  /**
   * Squares the scattered cards away into a grid centred on the workspace origin,
   * then frames that grid — the camera is centred on the cards, not on the old
   * pan position, so a board panned far off-screen comes back into view.
   */
  function handleTidyBoard(): void {
    const ws = activeWorkspace.value
    const viewport = viewportRef.value
    if (!ws || !viewport) return
    actionError.value = null

    // Measure the pieces on screen: a merged stack is taller and wider than a bare
    // card, so the pitch has to grow with it or a second row would sit on top of it.
    const slots = [...viewport.querySelectorAll<HTMLElement>('[data-testid^="group-slot-"]')]
    const widest = Math.max(
      ...slots.map((slot) => slot.offsetWidth + TIDY_GAP_X),
      DEFAULT_CARD_SPACING_X
    )
    const tallest = Math.max(
      ...slots.map((slot) => slot.offsetHeight + TIDY_GAP_Y),
      DEFAULT_CARD_SPACING_Y
    )
    const widestSlot = Math.max(...slots.map((slot) => slot.offsetWidth), DEFAULT_CARD_SPACING_X)
    const slotSizes: Record<string, { width: number; height: number }> = {}
    for (const slot of slots) {
      const testId = slot.getAttribute('data-testid')
      if (!testId?.startsWith('group-slot-')) continue
      slotSizes[testId.slice('group-slot-'.length)] = {
        width: slot.offsetWidth,
        height: slot.offsetHeight,
      }
    }

    // Fit as many whole pieces as the felt is wide, plus a little breathing room.
    const usableWidth = viewport.clientWidth - 32
    const columns = Math.max(
      1,
      Math.min(
        ws.groups.length,
        DEFAULT_CARDS_PER_ROW,
        Math.floor((usableWidth - widestSlot) / widest) + 1
      )
    )
    const changed = tidyWorkspaceGroups(ws, {
      columns,
      spacingX: widest,
      spacingY: tallest,
      slotSizes,
    })

    if (changed) {
      tidyingBoard.value = true
      playSfx('place')
      juice.pushCue('TIDY', 'neutral')
      const timer = setTimeout(() => {
        tidyingBoard.value = false
        timers.delete(timer)
      }, 320)
      timers.add(timer)
    }

    void juice.glideToGroups(ws, ws.groups.map((group) => group.id))
  }

  /** True when the click that follows a drag belongs to that drag, not a select. */
  function consumeSuppressedClick(): boolean {
    if (!suppressNextSelectClick) return false
    suppressNextSelectClick = false
    return true
  }

  onMounted(() => {
    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', handleWindowPointerUp)
    window.removeEventListener('pointercancel', handleWindowPointerUp)
    timers.forEach((timer) => clearTimeout(timer))
    timers.clear()
  })

  return {
    activeDrag,
    hoveredPanLabel,
    tidyingBoard,
    handleGroupPointerDown,
    handleCanvasPointerDown,
    handleCanvasWheel,
    handleRecenterView,
    handleTidyBoard,
    consumeSuppressedClick,
  }
}

export type BoardGestures = ReturnType<typeof useBoardGestures>
