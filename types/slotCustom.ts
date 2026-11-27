export type SlotCustomOverrides = {
  playstyles?: Array<{ playstyle_id: number; name: string; is_plus: boolean; image_url?: string; image_url_plus?: string }>;
  forceFullChem?: boolean;
  addedPositions?: string[];
  backgroundUrl?: string | null;
  versionLabel?: string | null;
  overall?: number;
  faceStats?: Partial<Record<'pac' | 'sho' | 'pas' | 'dri' | 'def' | 'phy', number>>;
  sm?: number;
  wf?: number;
};
