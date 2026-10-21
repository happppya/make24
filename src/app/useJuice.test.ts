import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useJuice } from './useJuice'

let host: HTMLElement | null = null

afterEach(() => {
  host?.remove()
  host = null
})

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/** A felt of 800 × 600 with the plane origin (felt centre) at (400, 300). */
function mountPlane(): void {
  host = document.createElement('div')
  host.getBoundingClientRect = () => rect(0, 0, 800, 600)
  const plane = document.createElement('div')
  plane.setAttribute('data-testid', 'workspace-plane')
  plane.getBoundingClientRect = () => rect(400, 300, 800, 600)
  host.appendChild(plane)
  document.body.appendChild(host)
}

describe('felt particle bursts', () => {
  it('starts a burst with no target piece at the felt centre, not the plane corner', async () => {
    mountPlane()
    const viewport = ref<HTMLElement | null>(host)
    const juice = useJuice(viewport)

    // A hit with nothing selected has no group slot to anchor to.
    juice.triggerImpact('hit')
    await nextTick()
    await nextTick()

    const particles = juice.particleBursts.value[0]?.particles ?? []
    expect(particles.length).toBeGreaterThan(0)
    // Plane-local coordinates: the felt centre is the plane origin.
    expect(particles.every((particle) => particle.originX === 0)).toBe(true)
    expect(particles.every((particle) => particle.originY === 0)).toBe(true)

    juice.dispose()
  })
})
