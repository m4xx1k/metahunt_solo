const ADJECTIVES = [
  "Cosmic",
  "Electric",
  "Midnight",
  "Neon",
  "Quantum",
  "Turbo",
  "Velvet",
  "Wild",
] as const;

const NOUNS = [
  "Badger",
  "Capybara",
  "Falcon",
  "Gecko",
  "Otter",
  "Panda",
  "Raccoon",
  "Walrus",
] as const;

export function createSubscriptionName(id: string): string {
  const compact = id.replaceAll("-", "");
  const adjectiveIndex = Number.parseInt(compact.slice(0, 2), 16) % ADJECTIVES.length;
  const nounIndex = Number.parseInt(compact.slice(2, 4), 16) % NOUNS.length;
  return `${ADJECTIVES[adjectiveIndex]} ${NOUNS[nounIndex]} #${compact.slice(0, 6).toUpperCase()}`;
}
