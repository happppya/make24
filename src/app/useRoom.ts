import { computed, ref, watch, type Ref } from 'vue'
import { playSfx } from '../audio/sfx'
import {
  createLobby,
  isRoomHost,
  joinLobby,
  leaveRoom,
  multiplayer as multiplayerSession,
  openLobbyBrowser,
  selfPlayer,
  sendToRoom,
  tableServerLabel,
} from '../multiplayer/session'
import type { GameSettings, PlayerInfo, ScreenPhase } from '../engine/types'
import type { Match } from './useMatch'
import type { Standings } from './useStandings'

/**
 * Everything about sitting at a table: browsing, creating and joining rooms,
 * readiness, and keeping the host's rules in sync with every seat.
 */
export function useRoom(deps: {
  settings: GameSettings
  phase: Ref<ScreenPhase>
  match: Match
  standings: Standings
}) {
  const { settings, phase, match, standings } = deps

  const playerName = ref(multiplayerSession.name)
  /** Code typed on the lobby selector. */
  const lobbyCodeInput = ref('')
  /** Create form: public lobbies are listed for everyone, private ones are code-only. */
  const newLobbyIsPublic = ref(true)
  const creatingLobby = ref(false)
  const joiningLobby = ref(false)

  const multiplayerHost = computed(
    () => settings.isMultiplayer && multiplayerSession.room !== null && isRoomHost.value
  )
  const multiplayerSeated = computed(
    () =>
      settings.isMultiplayer &&
      multiplayerSession.status === 'connected' &&
      multiplayerSession.room !== null
  )
  const multiplayerReady = computed(() =>
    standings.players.value.every((player: PlayerInfo) => player.isHost || player.isReady)
  )
  const canEditSettings = computed(
    () => !settings.isMultiplayer || (multiplayerSeated.value && multiplayerHost.value)
  )
  const connectionLine = computed(() => {
    switch (multiplayerSession.status) {
      case 'connecting':
        return `Connecting to ${multiplayerSession.transportLabel || tableServerLabel()}…`
      case 'connected':
        return multiplayerSession.room
          ? `Room ${multiplayerSession.room.code} · ${multiplayerSession.room.isPublic ? 'public' : 'private'} · ${multiplayerSession.transportLabel}`
          : `Browsing lobbies at ${multiplayerSession.transportLabel}`
      case 'error':
        return multiplayerSession.error ?? 'Could not reach the table server.'
      case 'disconnected':
        return 'Connection lost — return to the lobby list to reconnect.'
      default:
        return `Start the table server with npm run dev:server to play online.`
    }
  })

  /* ------------------------------ navigation ------------------------------ */

  /** Title screen → lobby list. Connects without taking a seat. */
  function goToTableBrowser(): void {
    settings.isMultiplayer = true
    phase.value = 'lobby-select'
    // Coming back to the list (or onto a new table) must re-apply the next deal,
    // even if the round number matches the one left behind.
    match.forgetAppliedRound()
    void openLobbyBrowser()
  }

  async function createTable(): Promise<void> {
    playSfx('click')
    creatingLobby.value = true
    const isPublic = newLobbyIsPublic.value
    await createLobby({
      name: playerName.value.trim() || multiplayerSession.name,
      isPublic,
    })
    creatingLobby.value = false
    if (multiplayerSession.room) {
      playSfx('select')
      phase.value = 'lobby'
    }
  }

  async function joinTableByCode(code = lobbyCodeInput.value): Promise<void> {
    playSfx('click')
    joiningLobby.value = true
    await joinLobby(code, playerName.value.trim() || multiplayerSession.name)
    joiningLobby.value = false
    const joined = multiplayerSession.room
    if (joined) {
      playSfx('select')
      // A table still in its lobby is shown as-is; a match in progress is mirrored
      // by the room watcher, which also deals the current hand.
      if (joined.phase === 'lobby') phase.value = 'lobby'
    }
  }

  /** Back to the list, freeing the seat. The room runs on without you. */
  function leaveTable(): void {
    playSfx('click')
    leaveRoom()
    goToTableBrowser()
  }

  function toggleReady(): void {
    const me = selfPlayer.value
    if (!me || me.isHost) return
    sendToRoom({ t: 'set-ready', ready: !me.isReady })
    playSfx('click')
  }

  /* ------------------------------ server sync ------------------------------ */

  watch(
    () => multiplayerSession.room,
    (room) => {
      if (room) match.applyRoomSnapshot(room)
    }
  )

  // Non-hosts mirror the host's rules; the host is the source of truth and pushes edits.
  watch(
    () => multiplayerSession.room?.settings,
    (remote) => {
      if (!settings.isMultiplayer || !remote || multiplayerHost.value) return
      Object.assign(settings, JSON.parse(JSON.stringify(remote))) as GameSettings
    },
    { deep: true }
  )

  let settingsPushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    settings,
    () => {
      if (!settings.isMultiplayer || !multiplayerHost.value) return
      if (multiplayerSession.room?.phase !== 'lobby') return
      if (settingsPushTimer) clearTimeout(settingsPushTimer)
      settingsPushTimer = setTimeout(() => {
        sendToRoom({ t: 'update-settings', settings: JSON.parse(JSON.stringify(settings)) })
      }, 150)
    },
    { deep: true }
  )

  function dispose(): void {
    if (settingsPushTimer) clearTimeout(settingsPushTimer)
  }

  return {
    playerName,
    lobbyCodeInput,
    newLobbyIsPublic,
    creatingLobby,
    joiningLobby,
    multiplayerHost,
    multiplayerSeated,
    multiplayerReady,
    canEditSettings,
    connectionLine,
    goToTableBrowser,
    createTable,
    joinTableByCode,
    leaveTable,
    toggleReady,
    dispose,
  }
}

export type Room = ReturnType<typeof useRoom>
