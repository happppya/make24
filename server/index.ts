import { createMultiplayerServer } from './server'

/**
 * Local development entrypoint.
 *
 *   npm run dev:server          # tsx watch, restarts on edit
 *   PORT=8080 ALLOWED_ORIGIN=https://play.example.com npm run dev:server
 *
 * The browser client reads VITE_MULTIPLAYER_URL (default ws://<host>:8787/ws),
 * so moving this process to Oracle Cloud is a deploy + env-var change, not a
 * code change.
 */

// Treat an unset/zero PORT as "use the default": some dev shells export PORT=0,
// which would otherwise hand out a random port the browser cannot find.
const envPort = Number(process.env.PORT ?? 0)
const port = Number.isFinite(envPort) && envPort > 0 ? envPort : 8787
const host = process.env.HOST ?? '0.0.0.0'
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? '*'

const server = await createMultiplayerServer({
  port,
  host,
  allowedOrigin,
  log: (line) => console.log(`[table] ${line}`),
})

console.log(`[table] multiplayer server listening on ws://${host}:${server.port}/ws`)
console.log(`[table] health: http://localhost:${server.port}/health`)
if (allowedOrigin !== '*') {
  console.log(`[table] accepting browser origins: ${allowedOrigin}`)
}

let shuttingDown = false
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[table] ${signal} received — closing sockets`)
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('uncaughtException', (error) => {
  console.error('[table] uncaught exception', error)
})
