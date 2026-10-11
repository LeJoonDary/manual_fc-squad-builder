import { expect, test } from 'vitest';
import { calculateMetaScore, buildDynamicFillOrder } from './autoBuildUtils';
const card={overall:90,facePace:90,sho:80,pas:80,dri:80,def:80,phy:80,finishing:100,composure:80,agility:100,balance:80,card_type:'gold_rare'};
test.each([['ST',85.5],['CF',85.5],['CAM',83],['LW',85.5],['RM',85.5],['CM',82.5],['CDM',82.5],['CB',83.5],['LCB',83.5],['LB',85.5],['RWB',85.5],['GK',90]])('exact %s formula', (pos, expected)=>{
 expect(calculateMetaScore(card,String(pos))).toBeCloseTo(Number(expected));
});
test('OVR baseline, special cards, thresholds and missing stats',()=>{
 expect(calculateMetaScore({...card,overall:95},'ST')-calculateMetaScore(card,'ST')).toBeCloseTo(1);
 expect(calculateMetaScore({...card,card_type:'promo'},'ST')-calculateMetaScore(card,'ST')).toBe(0);
 expect(calculateMetaScore({...card,facePace:84},'RW')).toBeCloseTo(83.1);
 expect(calculateMetaScore({...card,facePace:85},'RW')).toBeGreaterThan(0);
 expect(calculateMetaScore({...card,def:69},'LCM')).toBeCloseTo(80.85);
 expect(calculateMetaScore({...card,def:74},'CDM')).toBeCloseTo(81.6);
 expect(Number.isFinite(calculateMetaScore({},'ST'))).toBe(true);
 expect(calculateMetaScore(null,'ST')).toBe(0);
 expect(calculateMetaScore({overall:0,pac:0,sho:0,pas:0,dri:0,def:0,phy:0},'ST')).toBe(0);
});
test('joined array and normalized detailed stats yield the same score',()=>{
 const {overall,card_type,facePace,...stats}=card;
 expect(calculateMetaScore({overall,card_type,player_stats:[{...stats,pac:facePace}]},'ST')).toBe(calculateMetaScore(card,'ST'));
 expect(calculateMetaScore({overall,card_type,player_stats:{...stats,pac:facePace}},'CAM')).toBe(calculateMetaScore(card,'CAM'));
 expect(calculateMetaScore({...card,agility:null,balance:null,movement_agility:100,movement_balance:80},'ST')).toBe(calculateMetaScore(card,'ST'));
});
test('priority groups move all relevant formation slots together',()=>{
 const slots=['GK','ST','CF','LW','RM','LCB','RCB','LDM','CM','LB','RB'].map(position=>({position}));
 expect(buildDynamicFillOrder(slots,['FB','WIDE','CM']).map(s=>s.position)).toEqual(['LB','RB','LW','RM','LDM','CM','ST','CF','LCB','RCB','GK']);
});
