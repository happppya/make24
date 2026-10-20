import {
  puzzleLeaderboardKey,
  sortPuzzleLeaderboard,
  type PuzzleDefinition,
  type PuzzleLeaderboardEntry,
} from '../engine/puzzles'
import { resolveServerUrl } from '../multiplayer/transport'

const BOARDS_KEY = 'make24-puzzle-boards-v1'
const NAME_KEY = 'make24-puzzle-name'

export interface PuzzleBoardSnapshot {
  entries: PuzzleLeaderboardEntry[]
  rank?: number
  improved?: boolean
}

interface StoredBoards {
  version: 1
  boards: Record<string, PuzzleLeaderboardEntry[]>
}

/** ws://host:8787/ws → http://host:8787/puzzles/... (same host, plain HTTP). */
export function puzzleLeaderboardUrl(puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>): string {
  const wsUrl = resolveServerUrl()
  const base = wsUrl
    .replace(/^ws:/, 'http:')
    .replace(/^wss:/, 'https:')
    .replace(/\/ws\/?$/, '')
  return `${base}/puzzles/${puzzle.kind}/${encodeURIComponent(puzzle.key)}/leaderboard`
}

export function readPuzzlePlayerName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function savePuzzlePlayerName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name.trim())
  } catch {
    // Storage can be unavailable in private windows; the session still works.
  }
}

export function readLocalPuzzleBoards(): Record<string, PuzzleLeaderboardEntry[]> {
  try {
    const raw = window.localStorage.getItem(BOARDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredBoards
    if (parsed?.version !== 1 || typeof parsed.boards !== 'object') return {}
    return parsed.boards
  } catch {
    return {}
  }
}

function writeLocalPuzzleBoards(boards: Record<string, PuzzleLeaderboardEntry[]>): void {
  try {
    window.localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify({ version: 1, boards } satisfies StoredBoards)
    )
  } catch {
    // A full or disabled localStorage only costs the offline copy.
  }
}

/** Records a local best and returns the board as this device now sees it. */
export function recordLocalPuzzleAttempt(
  puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>,
  entry: PuzzleLeaderboardEntry
): PuzzleLeaderboardEntry[] {
  const boards = readLocalPuzzleBoards()
  const key = puzzleLeaderboardKey(puzzle)
  const current = boards[key] ?? []
  const identity = entry.playerName.trim().toLocaleLowerCase()
  const existing = current.find(
    (row) => row.playerName.trim().toLocaleLowerCase() === identity
  )
  if (!existing || entry.score < existing.score) {
    const next = current.filter(
      (row) => row.playerName.trim().toLocaleLowerCase() !== identity
    )
    next.push({ ...entry, playerName: entry.playerName.trim().slice(0, 24) })
    boards[key] = sortPuzzleLeaderboard(next).slice(0, 50)
    writeLocalPuzzleBoards(boards)
  }
  return boards[key] ?? current
}

/** The local copy of a board, used whenever the table server is unreachable. */
export function localPuzzleBoard(
  puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>
): PuzzleLeaderboardEntry[] {
  return readLocalPuzzleBoards()[puzzleLeaderboardKey(puzzle)] ?? []
}

export function bestPuzzleScore(
  entries: PuzzleLeaderboardEntry[],
  playerName: string
): number | null {
  const identity = playerName.trim().toLocaleLowerCase()
  if (!identity) return null
  const row = entries.find(
    (entry) => entry.playerName.trim().toLocaleLowerCase() === identity
  )
  return row?.score ?? null
}

/**
 * Reads the shared board from the table server. The server's HTTP surface is
 * separate from the multiplayer socket, so the puzzle screens work without
 * opening a room.
 */
export async function fetchPuzzleBoard(
  puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>,
  timeoutMs = 4500
): Promise<PuzzleLeaderboardEntry[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(puzzleLeaderboardUrl(puzzle), {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status}).`)
    const body = (await response.json()) as { entries?: unknown }
    return sanitizeRemoteEntries(body.entries)
  } finally {
    clearTimeout(timer)
  }
}

export async function postPuzzleAttempt(
  puzzle: Pick<PuzzleDefinition, 'kind' | 'key'>,
  playerName: string,
  expression: unknown,
  timeoutMs = 6000
): Promise<PuzzleBoardSnapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(puzzleLeaderboardUrl(puzzle), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, expression }),
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as {
      entries?: unknown
      rank?: unknown
      improved?: unknown
      error?: unknown
    }
    if (!response.ok) {
      throw new Error(
        typeof body.error === 'string' ? body.error : `Submission failed (${response.status}).`
      )
    }
    return {
      entries: sanitizeRemoteEntries(body.entries),
      rank: typeof body.rank === 'number' ? body.rank : undefined,
      improved: Boolean(body.improved),
    }
  } finally {
    clearTimeout(timer)
  }
}

function sanitizeRemoteEntries(raw: unknown): PuzzleLeaderboardEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: PuzzleLeaderboardEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<PuzzleLeaderboardEntry>
    if (
      typeof row.playerName !== 'string' ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      typeof row.equation !== 'string' ||
      typeof row.lhs !== 'string' ||
      typeof row.finalValue !== 'number' ||
      !Number.isFinite(row.finalValue) ||
      typeof row.submittedAt !== 'number'
    ) {
      continue
    }
    entries.push({
      playerName: row.playerName.slice(0, 24),
      score: row.score,
      equation: row.equation.slice(0, 500),
      lhs: row.lhs.slice(0, 500),
      finalValue: row.finalValue,
      submittedAt: row.submittedAt,
    })
  }
  return sortPuzzleLeaderboard(entries)
}
