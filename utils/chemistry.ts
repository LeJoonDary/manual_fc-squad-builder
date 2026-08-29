import type { ChemistryResult, PlayerCard, SquadSlot } from '../types/chemistry';

const CLUB_THRESHOLDS = [2, 4, 7] as const;
const LEAGUE_THRESHOLDS = [3, 5, 8] as const;
const NATION_THRESHOLDS = [2, 5, 8] as const;

type EntityId = PlayerCard['nationId'];
type CountMap = Map<string, number>;

function normalizePosition(position: string): string {
  return position.trim().toUpperCase();
}

function isPositionMatch(slot: SquadSlot): slot is SquadSlot & { player: PlayerCard } {
  if (!slot.player) return false;
  const slotPosition = normalizePosition(slot.position);
  return [slot.player.position, ...(slot.player.altPositions ?? [])]
    .some((position) => normalizePosition(position) === slotPosition);
}

function normalizeEntityId(id: EntityId): string {
  return String(id).normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function addCount(counts: CountMap, id: EntityId, amount: number): void {
  const key = normalizeEntityId(id);
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

function getThresholdScore(count: number, thresholds: readonly number[]): number {
  return thresholds.reduce((score, threshold) => score + Number(count >= threshold), 0);
}

function firstValue(card: Record<string, unknown>, fields: string[]): unknown {
  return fields.map((field) => card[field]).find((value) => value !== undefined && value !== null && value !== '');
}

function canonicalAffiliationKey(
  card: Record<string, unknown>,
  kind: 'nation' | 'league' | 'club',
  nameFields: string[],
  idFields: string[],
): string {
  const name = firstValue(card, nameFields);
  if (typeof name === 'string' && name.trim()) {
    return `${kind}:name:${name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`;
  }
  const id = firstValue(card, idFields);
  return `${kind}:id:${String(id ?? 'unknown').normalize('NFKC').trim().toLocaleLowerCase('en-US')}`;
}

/**
 * Converts UI, mock, and database card shapes into one chemistry-card shape.
 * Display names are the canonical affiliation key when available so records
 * with nationId/nation_id differences still join the same chemistry group.
 */
export function adaptChemistryPlayerCard(rawCard: Record<string, unknown>): PlayerCard {
  const rawAltPositions = firstValue(rawCard, ['altPositions', 'secondary_positions']);
  const altPositions = Array.isArray(rawAltPositions)
    ? rawAltPositions.map(String)
    : typeof rawAltPositions === 'string'
      ? rawAltPositions.split(',').map((position) => position.trim()).filter(Boolean)
      : [];

  return {
    id: String(firstValue(rawCard, ['id', 'card_id']) ?? ''),
    name: String(firstValue(rawCard, ['name', 'player_name', 'card_name', 'display_name']) ?? '이름 없는 선수'),
    position: String(firstValue(rawCard, ['position', 'primary_position', 'position_name', 'role']) ?? ''),
    altPositions,
    nationId: canonicalAffiliationKey(rawCard, 'nation', ['nation', 'nationName', 'nation_name', 'nationality'], ['nationId', 'nation_id']),
    leagueId: canonicalAffiliationKey(rawCard, 'league', ['league', 'leagueName', 'league_name'], ['leagueId', 'league_id']),
    clubId: canonicalAffiliationKey(rawCard, 'club', ['club', 'clubName', 'club_name', 'team'], ['clubId', 'club_id']),
    isIcon: Boolean(firstValue(rawCard, ['isIcon', 'is_icon'])),
    isHero: Boolean(firstValue(rawCard, ['isHero', 'is_hero'])),
  };
}

/**
 * Calculates EA FC squad chemistry for the supplied slots.
 *
 * Icons add one league count to every league represented by an in-position
 * card in the squad. Out-of-position cards never establish or contribute to
 * a chemistry group.
 */
export function calculateChemistry(squad: SquadSlot[]): ChemistryResult {
  const playerChemMap: Record<string, number> = {};
  const validSlots = squad.filter(isPositionMatch);
  const clubCounts: CountMap = new Map();
  const leagueCounts: CountMap = new Map();
  const nationCounts: CountMap = new Map();

  squad.forEach((slot) => {
    if (slot.player) playerChemMap[slot.player.id] = 0;
  });

  // A league only participates when at least one correctly positioned card
  // from that league is present. Each Icon subsequently boosts every one.
  const representedLeagueIds = new Map(
    validSlots.map(({ player }) => [normalizeEntityId(player.leagueId), player.leagueId]),
  );
  const iconCount = validSlots.filter(({ player }) => player.isIcon).length;

  validSlots.forEach(({ player }) => {
    if (player.isIcon) {
      addCount(nationCounts, player.nationId, 2);
      return;
    }
    if (player.isHero) {
      addCount(leagueCounts, player.leagueId, 2);
      addCount(nationCounts, player.nationId, 1);
      return;
    }
    addCount(clubCounts, player.clubId, 1);
    addCount(leagueCounts, player.leagueId, 1);
    addCount(nationCounts, player.nationId, 1);
  });

  representedLeagueIds.forEach((leagueId) => addCount(leagueCounts, leagueId, iconCount));

  validSlots.forEach(({ player }) => {
    if (player.isIcon || player.isHero) {
      playerChemMap[player.id] = 3;
      return;
    }
    const clubScore = getThresholdScore(clubCounts.get(normalizeEntityId(player.clubId)) ?? 0, CLUB_THRESHOLDS);
    const leagueScore = getThresholdScore(leagueCounts.get(normalizeEntityId(player.leagueId)) ?? 0, LEAGUE_THRESHOLDS);
    const nationScore = getThresholdScore(nationCounts.get(normalizeEntityId(player.nationId)) ?? 0, NATION_THRESHOLDS);
    const chemistry = clubScore + leagueScore + nationScore;
    playerChemMap[player.id] = Math.min(3, chemistry);
  });

  const totalChemistry = Math.min(33, Object.values(playerChemMap).reduce((total, chemistry) => total + chemistry, 0));
  return {
    totalChemistry,
    playerChemMap,
    groupCounts: {
      club: Object.fromEntries(clubCounts),
      league: Object.fromEntries(leagueCounts),
      nation: Object.fromEntries(nationCounts),
    },
  };
}
