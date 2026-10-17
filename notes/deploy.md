# Deploying

## GitHub Pages (frontend)

`.github/workflows/deploy-pages.yml` runs on every push to `master` and by hand
via **workflow_dispatch**. It installs with `npm ci`, runs `npm run build`
(typecheck included), uploads `dist/` as the Pages artifact, then deploys it with
`actions/deploy-pages`. Permissions are scoped to `contents: read`,
`pages: write`, `id-token: write`, and deployments are queued rather than
cancelled so a push during a deploy still reaches the site.

**One-time setup:** Settings → Pages → Build and deployment → Source:
**GitHub Actions**. The workflow's `GITHUB_TOKEN` cannot flip that switch (the
Pages enablement API needs a PAT or App token with `pages: write`), so it stays
manual; until it is set, the deploy job fails with "Pages is not enabled".

### Sub-path assets

Project sites live at `https://<user>.github.io/<repo>/`, so production builds
use `base: './'` (see `vite.config.ts`). Consequences:

- Vite writes relative `./assets/…` references into `index.html`; no base
  variable is needed in CI and custom domains work unchanged.
- Anything read from `public/` at runtime must go through `assetUrl()`
  (`src/assetUrl.ts`) rather than a root-absolute string, or it will 404 under
  the repo path. Card sprites (rendered by `CardGroupNode`, the title hero and
  the joker art) and the tutorial screenshots do this.
- `src/engine/deck.ts` still stores `/card-sprites/…` paths because the table
  server imports it in Node, where Vite's `BASE_URL` does not exist; the prefix
  is applied when the component renders the card.

### Multiplayer

The table server is not deployed by this workflow. To make the hosted site
multiplayer-capable, add a repository variable `VITE_MULTIPLAYER_URL`
(Settings → Secrets and variables → Actions → Variables), e.g.
`wss://table.example.com/ws`; the build step passes it through and
`resolveServerUrl()` picks it up. The server's `ALLOWED_ORIGIN` must include the
Pages origin. Without the variable the site is single-player only.
