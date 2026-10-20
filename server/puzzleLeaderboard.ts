import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  sortPuzzleLeaderboard,
  type PuzzleLeaderboardEntry,
} from '../src/engine/puzzles'

const STORE_VERSION = 1
const MAX_ENTRIES = 50

interface StoredBoard {
  version: number
  boards: Record<string, PuzzleLeaderboardEntry[]>
}

export interface PuzzleLeaderboardStoreOptions {
  /** Omit or pass null for an in-memory store (tests, ephemeral servers). */
  filePath?: string | null
  log?: (line: string) => void
}

export interface PuzzleSubmitResult {
  entries: PuzzleLeaderboardEntry[]
  rank: number
  improved: boolean
}

/**
 * The tiny persistence layer behind the puzzle boards.
 *
 * Boards are keyed by `kind:period` and survive server restarts in a JSON file.
 * A player's name is their identity (there is no account system yet), so a
 * repeat submission only replaces their row when the new score is lower.
 */
export class PuzzleLeaderboardStore {
  private readonly filePath: string | null
  private readonly log: (line: string) => void
  private readonly boards = new Map<string, PuzzleLeaderboardEntry[]>()

  constructor(options: PuzzleLeaderboardStoreOptions = {}) {
    this.filePath = options.filePath ?? null
    this.log = options.log ?? (() => {})
    this.load()
  }

  top(key: string, limit = MAX_ENTRIES): PuzzleLeaderboardEntry[] {
    return (this.boards.get(key) ?? []).slice(0, Math.max(0, limit))
  }

  boardCount(): number {
    return this.boards.size
  }

  /** Adds one validated attempt, keeping only each name's best result. */
  submit(key: string, entry: PuzzleLeaderboardEntry): PuzzleSubmitResult {
    const normalized = normalizePlayerName(entry.playerName)
    const identity = playerIdentity(normalized)
    const current = this.boards.get(key) ?? []
    const existing = current.find((row) => playerIdentity(row.playerName) === identity)

    if (existing && existing.score <= entry.score) {
      return {
        entries: current.slice(0, MAX_ENTRIES),
        rank: current.indexOf(existing) + 1,
        improved: false,
      }
    }

    const next = current.filter((row) => playerIdentity(row.playerName) !== identity)
    next.push({ ...entry, playerName: normalized })
    const sorted = sortPuzzleLeaderboard(next).slice(0, MAX_ENTRIES)
    this.boards.set(key, sorted)
    this.persist()

    return {
      entries: sorted,
      rank: sorted.findIndex((row) => playerIdentity(row.playerName) === identity) + 1,
      improved: true,
    }
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredBoard
      if (!parsed || parsed.version !== STORE_VERSION || typeof parsed.boards !== 'object') {
        return
      }
      for (const [key, rows] of Object.entries(parsed.boards)) {
        if (!Array.isArray(rows)) continue
        this.boards.set(key, sanitizeRows(rows))
      }
    } catch (error) {
      this.log(
        `could not read puzzle leaderboards at ${this.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const boards: Record<string, PuzzleLeaderboardEntry[]> = {}
      for (const [key, rows] of this.boards) boards[key] = rows
      writeFileSync(
        this.filePath,
        `${JSON.stringify({ version: STORE_VERSION, boards }, null, 2)}\n`,
        'utf8'
      )
    } catch (error) {
      this.log(
        `could not write puzzle leaderboards at ${this.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}

export function normalizePlayerName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 24)
}

/** Names are the only identity here, so casing and spacing must not split a player. */
function playerIdentity(name: string): string {
  return normalizePlayerName(name).toLocaleLowerCase()
}

function sanitizeRows(raw: unknown[]): PuzzleLeaderboardEntry[] {
  const rows: PuzzleLeaderboardEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<PuzzleLeaderboardEntry>
    if (
      typeof row.playerName !== 'string' ||
      !row.playerName.trim() ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      row.score < 0 ||
      typeof row.equation !== 'string' ||
      typeof row.lhs !== 'string' ||
      typeof row.finalValue !== 'number' ||
      !Number.isFinite(row.finalValue) ||
      typeof row.submittedAt !== 'number' ||
      !Number.isFinite(row.submittedAt)
    ) {
      continue
    }
    rows.push({
      playerName: normalizePlayerName(row.playerName),
      score: row.score,
      equation: row.equation.slice(0, 500),
      lhs: row.lhs.slice(0, 500),
      finalValue: row.finalValue,
      submittedAt: row.submittedAt,
    })
  }
  return sortPuzzleLeaderboard(rows).slice(0, MAX_ENTRIES)
}
