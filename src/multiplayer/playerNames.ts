/**
 * Friendly handles for players who have not picked a name yet.
 *
 * Two small word banks keep every combination inside the 18-character limit,
 * while giving over a thousand possible seats: "Sneaky Joker", "Turbo Croupier",
 * "Cosmic Pipsqueak".
 */
const ADJECTIVES = [
  'Lucky',
  'Sneaky',
  'Cheeky',
  'Jolly',
  'Turbo',
  'Salty',
  'Sleepy',
  'Cosmic',
  'Dapper',
  'Rogue',
  'Feral',
  'Golden',
  'Crimson',
  'Pixel',
  'Shifty',
  'Bogus',
  'Wobbly',
  'Zesty',
  'Nimble',
  'Grumpy',
  'Spicy',
  'Sly',
  'Plucky',
  'Dizzy',
  'Funky',
  'Chill',
  'Peppy',
  'Moody',
  'Crafty',
  'Dandy',
  'Jaunty',
  'Loopy',
] as const

const NOUNS = [
  'Joker',
  'Ace',
  'Dealer',
  'Shark',
  'Pip',
  'Bluff',
  'Riffle',
  'Bust',
  'Flush',
  'Chip',
  'Tally',
  'Croupier',
  'Wildcard',
  'Shuffler',
  'Sleight',
  'Punter',
  'Number',
  'Numeral',
  'Ringer',
  'Jackpot',
  'Pipsqueak',
  'Cardnado',
  'Maestro',
  'Rascal',
  'Trickster',
  'Tallyman',
  'Jester',
  'Bandit',
  'Whiz',
  'Wizard',
  'Gambler',
  'Maverick',
  'Rookie',
  'Hustler',
  'Cardsharp',
] as const

function pick<T>(items: readonly T[], rng: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(Math.abs(rng()) * items.length))
  return items[index]!
}

/** A fresh two-word handle, e.g. "Lucky Pip" or "Crimson Shuffler". */
export function randomPlayerName(rng: () => number = Math.random): string {
  return `${pick(ADJECTIVES, rng)} ${pick(NOUNS, rng)}`
}
