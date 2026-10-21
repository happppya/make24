import { nextTick, ref, type Ref } from 'vue'
import { isSfxEnabled, playSfx, toggleSfx } from '../audio/sfx'
import { getGroupPosition, setWorkspacePan } from '../engine/workspace'
import type { WorkspaceState } from '../engine/types'
import { createParticleBurst, type BurstParticle, type ParticleBurstKind } from './particles'

export type ImpactKind = 'split' | 'error' | 'hit'
export type CueTone = 'good' | 'bad' | 'neutral'
export interface FloatingCue {
  id: number
  text: string
  tone: CueTone
  offsetX: number
}

/** One painted burst; particles carry felt-local origins so they can share a layer. */
export interface LiveParticleBurst {
  id: number
  kind: ParticleBurstKind
  particles: BurstParticle[]
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The table's "juice": sound, screen shake, floating cues, bobbing pieces,
 * pixel particle bursts and camera glides. Nothing here owns game state — the
 * board is passed in.
 */
export function useJuice(viewportRef: Ref<HTMLElement | null>) {
  const sfxOn = ref(isSfxEnabled())
  const impactKind = ref<ImpactKind | null>(null)
  const hitSignal = ref(0)
  const shellRef = ref<HTMLElement | null>(null)
  const feltRef = ref<HTMLElement | null>(null)
  const sidebarRef = ref<HTMLElement | null>(null)
  const panGlide = ref(false)
  const floatingCues = ref<FloatingCue[]>([])
  const particleBursts = ref<LiveParticleBurst[]>([])

  let cueSeed = 0
  let particleSeed = 0
  let impactTimer: ReturnType<typeof setTimeout> | null = null
  const cueTimers = new Set<ReturnType<typeof setTimeout>>()
  const particleTimers = new Set<ReturnType<typeof setTimeout>>()

  /**
   * Ease the felt so a freshly merged group (which can be a tall nested stack)
   * stays inside the workspace viewport instead of sliding off the bottom edge.
   */
  async function glideToGroups(ws: WorkspaceState | undefined, groupIds: string[]): Promise<void> {
    if (!ws || groupIds.length === 0) return
    await nextTick()
    // Let the pop-in animation finish so the measured box is the settled layout box.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const viewport = viewportRef.value
    if (!viewport) return

    // Union of every slot's box: sizes come from the DOM (pop transforms ignored),
    // but positions come from the workspace state. Reading `offsetLeft` here would
    // pick up a still-running tidy transition and frame a layout that no longer
    // exists, leaving the board visibly off-centre.
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let measured = 0
    groupIds.forEach((id, index) => {
      const slot = viewport.querySelector<HTMLElement>(`[data-testid="group-slot-${id}"]`)
      if (!slot) return
      measured++
      const { x, y } = getGroupPosition(ws, id, index)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + slot.offsetWidth)
      maxY = Math.max(maxY, y + slot.offsetHeight)
    })
    if (measured === 0) return

    // The plane's origin sits at the viewport centre, so shifting by the box's
    // centre puts that box in the middle; viewport size cancels out.
    const desiredPanX = Math.round(-(minX + maxX) / 2)
    const desiredPanY = Math.round(-(minY + maxY) / 2)
    if (Math.abs(desiredPanX - ws.panX) < 2 && Math.abs(desiredPanY - ws.panY) < 2) return

    panGlide.value = true
    setWorkspacePan(ws, desiredPanX, desiredPanY)
    const timer = setTimeout(() => {
      panGlide.value = false
      cueTimers.delete(timer)
    }, 300)
    cueTimers.add(timer)
  }

  /**
   * A short bob on one piece. The felt itself stays put: equipping an operator
   * should read as the card acknowledging it, not as the whole board lurching.
   */
  function bobGroup(groupId: string | null): void {
    if (!groupId || prefersReducedMotion()) return
    const slot = viewportRef.value?.querySelector<HTMLElement>(
      `[data-testid="group-slot-${groupId}"]`
    )
    // The slot owns the card's position, so animating it leaves the selected
    // piece's own lift/pulse transform untouched.
    if (!slot || typeof slot.animate !== 'function') return
    slot.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-9px)', offset: 0.32 },
        { transform: 'translateY(0)', offset: 0.62 },
        { transform: 'translateY(-4px)', offset: 0.82 },
        { transform: 'translateY(0)' },
      ],
      { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
  }

  /**
   * Paints a pixel burst over the felt. Merge/operator fireworks land on the
   * piece that changed; splits and hits default to the middle of the felt.
   * A missing group falls back to the centre instead of dropping the effect.
   *
   * Origins are measured against the workspace plane, not the felt: the burst
   * layer lives inside that plane, so a camera glide or a manual pan carries
   * the particles along with the card they belong to.
   */
  function spawnParticles(kind: ParticleBurstKind, groupId?: string | null): void {
    if (prefersReducedMotion()) return
    const viewport = viewportRef.value
    const plane = viewport?.querySelector<HTMLElement>('[data-testid="workspace-plane"]')
    const layer = plane ?? feltRef.value
    if (!layer) return

    const slot = groupId
      ? viewport?.querySelector<HTMLElement>(`[data-testid="group-slot-${groupId}"]`)
      : null
    // A burst with no target piece starts at the middle of the felt as it is
    // shown now; the plane moves with the camera, so its own origin is not the
    // felt centre once the board is panned.
    const layerBox = layer.getBoundingClientRect()
    const anchor = slot
      ? slot.getBoundingClientRect()
      : (viewport ?? layer).getBoundingClientRect()
    const x = anchor.left + anchor.width / 2 - layerBox.left - layer.clientLeft
    const y = anchor.top + anchor.height / 2 - layerBox.top - layer.clientTop

    const id = ++particleSeed
    particleBursts.value = [
      ...particleBursts.value.slice(-2),
      { id, kind, particles: createParticleBurst(kind, id * 7919, { x, y }) },
    ]
    const timer = setTimeout(() => {
      particleBursts.value = particleBursts.value.filter((burst) => burst.id !== id)
      particleTimers.delete(timer)
    }, 1400)
    particleTimers.add(timer)
  }

  /** Physical feedback: Web Animations API so every repeat replays cleanly. */
  function triggerImpact(kind: ImpactKind, groupId?: string | null): void {
    impactKind.value = kind
    if (impactTimer) clearTimeout(impactTimer)
    impactTimer = setTimeout(
      () => {
        impactKind.value = null
      },
      kind === 'hit' ? 900 : 380
    )

    // After the board action the new/changed slot only exists next frame.
    void nextTick(() => spawnParticles(kind, groupId))

    const canAnimate =
      typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'
    if (!canAnimate) return

    const feel = feltRef.value
    const side = sidebarRef.value
    const shell = shellRef.value

    if (kind === 'hit') {
      shell?.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)' },
          { transform: 'translate(-8px, 4px) rotate(-0.5deg)' },
          { transform: 'translate(7px, -3px) rotate(0.5deg)' },
          { transform: 'translate(-4px, 2px) rotate(-0.2deg)' },
          { transform: 'translate(0, 0) rotate(0deg)' },
        ],
        { duration: 460, easing: 'steps(5, end)' }
      )
      side?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.05) rotate(-1deg)' },
          { transform: 'scale(1)' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
      feel?.animate(
        [
          { filter: 'brightness(1)' },
          { filter: 'brightness(1.45) saturate(1.2)' },
          { filter: 'brightness(1)' },
        ],
        { duration: 520, easing: 'ease-out' }
      )
      return
    }

    if (kind === 'error') {
      shell?.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-9px)' },
          { transform: 'translateX(7px)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 260, easing: 'steps(4, end)' }
      )
      return
    }

    // Splitting a group presses the felt down a touch; nothing else moves it.
    feel?.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(3px) scale(0.995)' },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
  }

  function pushCue(text: string, tone: CueTone = 'neutral'): void {
    const id = ++cueSeed
    // The horizontal spot belongs to the cue, not its list position: cues are
    // dropped from the front as new ones arrive, and a CSS nth-child offset made
    // the survivors hop sideways mid-rise when they were re-indexed.
    const offsetX = 50 + (((id * 37) % 25) - 12)
    floatingCues.value = [...floatingCues.value.slice(-3), { id, text, tone, offsetX }]
    const timer = setTimeout(() => {
      floatingCues.value = floatingCues.value.filter((cue) => cue.id !== id)
      cueTimers.delete(timer)
    }, 1000)
    cueTimers.add(timer)
  }

  function onToggleSfx(): void {
    sfxOn.value = toggleSfx()
    if (sfxOn.value) playSfx('select')
  }

  function dispose(): void {
    if (impactTimer) clearTimeout(impactTimer)
    cueTimers.forEach((timer) => clearTimeout(timer))
    cueTimers.clear()
    particleTimers.forEach((timer) => clearTimeout(timer))
    particleTimers.clear()
  }

  return {
    sfxOn,
    impactKind,
    hitSignal,
    shellRef,
    feltRef,
    sidebarRef,
    viewportRef,
    panGlide,
    floatingCues,
    particleBursts,
    glideToGroups,
    bobGroup,
    spawnParticles,
    triggerImpact,
    pushCue,
    onToggleSfx,
    dispose,
  }
}

export type Juice = ReturnType<typeof useJuice>
