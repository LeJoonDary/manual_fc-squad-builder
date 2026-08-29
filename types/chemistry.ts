export interface PlayerCard {
  id: string;
  name: string;
  position: string;
  altPositions?: string[];
  nationId: number | string;
  leagueId: number | string;
  clubId: number | string;
  isIcon?: boolean;
  isHero?: boolean;
}

export interface SquadSlot {
  position: string;
  player: PlayerCard | null;
}

export interface ChemistryResult {
  totalChemistry: number;
  playerChemMap: Record<string, number>;
  groupCounts: {
    club: Record<string, number>;
    league: Record<string, number>;
    nation: Record<string, number>;
  };
}
