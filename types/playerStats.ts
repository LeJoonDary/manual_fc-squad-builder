export type PlayerStatKey =
  | 'pac' | 'sho' | 'pas' | 'dri' | 'def' | 'phy'
  | 'acceleration' | 'sprint_speed'
  | 'positioning' | 'finishing' | 'shot_power' | 'long_shots' | 'volleys' | 'penalties'
  | 'vision' | 'crossing' | 'fk_accuracy' | 'short_passing' | 'long_passing' | 'curve'
  | 'agility' | 'balance' | 'reactions' | 'ball_control' | 'dribbling' | 'composure'
  | 'interceptions' | 'heading_accuracy' | 'def_awareness' | 'standing_tackle' | 'sliding_tackle'
  | 'jumping' | 'stamina' | 'strength' | 'aggression'
  | 'gk_diving' | 'gk_handling' | 'gk_kicking' | 'gk_positioning' | 'gk_reflexes';
export type PlayerStats = Partial<Record<PlayerStatKey, number | null>>;
export type DetailedStatsRequirements = Partial<Record<PlayerStatKey, { min?: number; max?: number }>>;
