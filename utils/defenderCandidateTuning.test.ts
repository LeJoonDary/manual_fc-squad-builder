import { expect, test } from 'vitest';
import { passesNewCandidateFilter, pureMetaScore, calculateMetaScore } from './autoBuildUtils';
const base = {overall:85,position:'CB',pac:85,def:85,phy:85,price:1000,pas:77,dri:78};
test.each(['LB','RB','LWB','RWB'])('%s uses dribbling/passing inclusive floors even for CB primaries',position=>{
  for(const [dri,pas,allowed] of [[69,58,false],[75,74,false],[76,73,true],[78,77,true],[76,64,false],[76,65,true]] as const){
    for(const shape of [{...base,dri,pas},{...base,dri:undefined,pas:undefined,player_stats:[{dri,pas}]},
      {...base,dri:undefined,pas:undefined,faceDribbling:dri,facePassing:pas},
      {...base,dri:undefined,pas:undefined,face_stats:{dri,pas}}]){
      for(const input of [shape,{card:shape},{raw:shape}])
        expect(passesNewCandidateFilter(input,position,1000000)).toBe(allowed);
    }
  }
});
test.each(['CB','LCB','RCB'])('%s applies a single stepped penalty and retains PAC 75 hard cap',slot=>{
  const score78=pureMetaScore({...base,pac:78},slot);
  for(const [pac,penalty] of [[75,5],[76,4],[77,1],[78,0],[79,0]]){
    const card={...base,pac};
    const unpenalized=85*.10+85*.35+pac*.35+85*.20;
    expect(pureMetaScore(card,slot)).toBeCloseTo(unpenalized-penalty,10);
    expect(score78-pureMetaScore(card,slot)-(78-pac)*.35).toBeCloseTo(penalty,10);
    expect(calculateMetaScore(card,slot)).toBeCloseTo(pureMetaScore(card,slot)+10,10);
    expect(passesNewCandidateFilter(card,slot,1000000)).toBe(true);
    expect(pureMetaScore({card:{...card,pac:undefined,player_stats:[{pac}]}},slot)).toBeCloseTo(unpenalized-penalty,10);
  }
  expect(passesNewCandidateFilter({...base,pac:74},slot,1000000)).toBe(false);
});
test('new fullback floors do not block CB candidates with low passing/dribbling',()=>{
  expect(passesNewCandidateFilter({...base,pas:58,dri:69,pac:75},'CB',1000000)).toBe(true);
});
