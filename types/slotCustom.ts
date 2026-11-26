export type SlotCustomOverrides = {
  forceFullChem?: boolean;
  addedPositions?: string[];
  backgroundUrl?: string | null;
  versionLabel?: string | null;
  overall?: number;
  faceStats?: Partial<Record<'pac' | 'sho' | 'pas' | 'dri' | 'def' | 'phy', number>>;
  sm?: number;
  wf?: number;
};
