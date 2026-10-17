<script setup lang="ts">
/**
 * An annotated screenshot: the image, numbered dots pinned to real UI elements,
 * and the legend that explains each dot. Coordinates are percentages of the
 * image box, so the annotations hold at any display width.
 */
interface ShotPin {
  n: number
  x: number
  y: number
  label: string
}

withDefaults(
  defineProps<{
    src: string
    alt: string
    caption: string
    pins: ShotPin[]
    width?: 'wide' | 'medium' | 'narrow'
  }>(),
  { width: 'wide' }
)
</script>

<template>
  <figure class="shot" :class="`shot--${width}`">
    <div class="shot__frame">
      <img :src="src" :alt="alt" class="shot__img pixel-sprite" decoding="async" />
      <span
        v-for="pin in pins"
        :key="pin.n"
        class="shot__pin"
        :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
        aria-hidden="true"
      >
        {{ pin.n }}
      </span>
    </div>

    <figcaption class="shot__cap">
      <p class="shot__caption-text">{{ caption }}</p>
      <ol class="shot__legend">
        <li v-for="pin in pins" :key="`legend-${pin.n}`" class="shot__legend-item">
          <span class="shot__legend-num" aria-hidden="true">{{ pin.n }}</span>
          <span>{{ pin.label }}</span>
        </li>
      </ol>
    </figcaption>
  </figure>
</template>

<style scoped>
.shot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 4px;
}

.shot__frame {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  background: #08070d;
  border: 3px solid #09080f;
  outline: 2px solid rgba(255, 190, 11, 0.45);
  box-shadow:
    0 8px 0 #09080f,
    inset 0 0 0 1px rgba(248, 242, 224, 0.06);
  /* Pins on the outer edges are allowed to hang over the frame. */
  overflow: visible;
}

.shot--wide .shot__frame {
  width: 100%;
}

.shot--medium .shot__frame {
  width: min(460px, 100%);
}

.shot--narrow .shot__frame {
  width: min(268px, 100%);
}

.shot__img {
  display: block;
  width: 100%;
  height: auto;
  border: 2px solid rgba(9, 8, 15, 0.9);
}

.shot__pin {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gold);
  color: #15111e;
  border: 2px solid #09080f;
  box-shadow:
    0 3px 0 #09080f,
    0 0 0 2px rgba(255, 225, 105, 0.35);
  font-family: var(--font-pixel);
  font-weight: 700;
  font-size: 0.8rem;
  line-height: 1;
  pointer-events: none;
}

.shot__cap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shot__caption-text {
  margin: 0;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 1rem;
  line-height: 1.3;
}

.shot__legend {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 6px 18px;
}

.shot__legend-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 1.02rem;
  line-height: 1.3;
  color: var(--ink-cream);
}

.shot__legend-num {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  background: rgba(255, 190, 11, 0.16);
  border: 2px solid rgba(255, 190, 11, 0.6);
  color: var(--gold-bright);
  font-family: var(--font-pixel);
  font-size: 0.62rem;
  line-height: 1;
}

@media (max-width: 620px) {
  .shot__pin {
    width: 20px;
    height: 20px;
    font-size: 0.68rem;
  }

  .shot__legend {
    grid-template-columns: 1fr;
  }
}
</style>
