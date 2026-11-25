import type { CardCostFields } from './cardCost';

export interface PlayerCard extends CardCostFields {
  id: string;
  name: string;
  position: string;
  altPositions?: string[];
  nationId: number | string;
  leagueId: number | string;
  clubId: number | string;
  isIcon?: boolean;
  isHero?: boolean;
  isHallOfFut?: boolean;
  version?: string;
  body_type?: string | null;
  body_type_group?: string | null;
}

export interface SquadSlot {
  position: string;
  player: PlayerCard | null;
}

export interface ChemistryManager {
  leagueId?: number | string;
  nationId?: number | string;
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
