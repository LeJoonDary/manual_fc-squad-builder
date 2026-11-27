import type { SlotCustomOverrides } from './slotCustom';

/** Browser player snapshot, including catalog relations used by pitch/chemistry adapters. */
export type PlayerCardData = {
  id: string | number;
  name?: string;
  primary_position?: string;
  secondary_positions?: string[];
  [key: string]: unknown;
};
export type SavedEvoPlayer = {
  id: string;
  player: PlayerCardData;
  customOverrides: SlotCustomOverrides;
  savedAt: number;
};
