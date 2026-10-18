import { computed } from 'vue'
import { multiplayer } from '../multiplayer/session'
import type { GameSettings, PlayerInfo, SubmittedSolution } from '../engine/types'
import type { Match } from './useMatch'

/**
 * Derived view models for the scoreboards: whose seat is whose, who won the
 * round and who took the series. Multiplayer reads the authoritative room,
 * solo reads the local seats.
 */
export function useStandings(deps: { settings: GameSettings; match: Match }) {
  const { settings, match } = deps

  const players = computed<PlayerInfo[]>(() => {
    if (settings.isMultiplayer && multiplayer.room) {
      return multiplayer.room.players
    }
    return match.localPlayers.value
  })

  const roundNumber = computed(() => {
    if (settings.isMultiplayer && multiplayer.room?.round) {
      return multiplayer.room.round.number
    }
    return match.localRoundNumber.value
  })

  const roundSolutions = computed<SubmittedSolution[]>(() => {
    if (settings.isMultiplayer) return multiplayer.room?.round?.solutions ?? []
    return match.localRoundSolutions.value
  })

  const sortedRoundSolutions = computed(() =>
    [...roundSolutions.value].sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.timestampMs - b.timestampMs
    })
  )

  /** Everyone who took the round; two or more ids mean the best boards tied. */
  const roundWinnerIds = computed<string[]>(() => {
    if (settings.isMultiplayer) return multiplayer.room?.round?.winnerIds ?? []
    return match.localRoundWinnerId.value ? [match.localRoundWinnerId.value] : []
  })

  const roundWinners = computed(() =>
    players.value.filter((player) => roundWinnerIds.value.includes(player.id))
  )

  const roundWinnerNames = computed(() => roundWinners.value.map((player) => player.name).join(' + '))

  /**
   * The board each winner is credited with: their cheapest submission. Solutions
   * arrive sorted by score, so the first one per player is the one that won.
   */
  const winningSolutionIds = computed(() => {
    const ids = new Set<string>()
    const credited = new Set<string>()
    for (const solution of sortedRoundSolutions.value) {
      if (!roundWinnerIds.value.includes(solution.playerId) || credited.has(solution.playerId)) {
        continue
      }
      credited.add(solution.playerId)
      ids.add(solution.id)
    }
    return ids
  })

  const matchWinnerIds = computed<string[]>(() => {
    if (settings.isMultiplayer) return multiplayer.room?.matchWinnerIds ?? []
    return match.localMatchWinner.value ? [match.localMatchWinner.value.id] : []
  })

  const matchWinners = computed(() =>
    players.value.filter((player) => matchWinnerIds.value.includes(player.id))
  )

  /** The single series winner, or null when the match was drawn or never won. */
  const matchWinner = computed<PlayerInfo | null>(() =>
    matchWinners.value.length === 1 ? matchWinners.value[0]! : null
  )

  const matchWinnerNames = computed(() =>
    matchWinners.value.map((player) => player.name).join(' + ')
  )

  return {
    players,
    roundNumber,
    roundSolutions,
    sortedRoundSolutions,
    roundWinnerIds,
    roundWinners,
    roundWinnerNames,
    winningSolutionIds,
    matchWinnerIds,
    matchWinners,
    matchWinner,
    matchWinnerNames,
  }
}

export type Standings = ReturnType<typeof useStandings>
