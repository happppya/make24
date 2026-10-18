# audio/ — synthesized sound

[sfx.ts](sfx.ts) is the whole sound system. There are no audio files: every cue
is built from oscillators and short noise bursts, which keeps the chunky arcade
feel without shipping samples.

```ts
import { playSfx, isSfxEnabled, toggleSfx } from '../audio/sfx'

playSfx('merge')            // fire-and-forget; a no-op when muted or unsupported
const on = toggleSfx()      // flips the persisted preference, returns the new value
```

- The `AudioContext` is created lazily on the first user gesture, because browsers
  block audio before one; every call is a no-op when WebAudio is missing.
- The mute preference persists in `localStorage`; the Esc menu's sound button
  reads it through `isSfxEnabled()` (the `sfxOn` ref in [../app/useJuice.ts](../app/useJuice.ts)).
- Cues are named by intent (`deal`, `merge`, `hit`, `tick`, `fanfare`, …). Add a
  name to `SfxName` and give it a small timbre in the same file rather than
  reaching for an asset.
