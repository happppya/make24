/**
 * URL for a file in `public/`, resolved against Vite's `base`.
 *
 * GitHub Pages serves a project site from `/<repo>/`, where a bare
 * `/card-sprites/…` would hit the domain root and 404. Builds use a relative
 * base (`./`), so every runtime asset URL has to be built from `BASE_URL`
 * rather than hard-coded to the root.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const trimmedBase = base.replace(/\/+$/, '')
  return `${trimmedBase}/${path.replace(/^\/+/, '')}`
}
