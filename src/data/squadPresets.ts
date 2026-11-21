// Share 버튼으로 복사한 URL에서 ?s= 뒤 문자열을 shareCode에 붙여 넣으세요.
// 완성 스쿼드는 autoBuildOnLoad: false, 자동 완성이 필요한 앵커 스쿼드는 true로 설정합니다.
// 초기 샘플은 DB별 카드 ID 차이를 피하는 빈 예산/포메이션 템플릿이며 로드 후 자동 완성합니다.
export interface SquadPreset {
  id: string; labelKo: string; labelEn: string; tag: string;
  shareCode: string; autoBuildOnLoad?: boolean;
}
export const squadPresets: SquadPreset[] = [
  { id: 'starter', labelKo: '입문 4-4-2', labelEn: 'Starter 4-4-2', tag: '75K', shareCode: 'djF8NC00LTJ8LCwsLCwsLCwsLHx8NzUwMDA', autoBuildOnLoad: true },
  { id: 'balanced', labelKo: '균형 4-3-3', labelEn: 'Balanced 4-3-3', tag: '300K', shareCode: 'djF8NC0zLTN8LCwsLCwsLCwsLHx8MzAwMDAw', autoBuildOnLoad: true },
  { id: 'diamond', labelKo: '중앙 다이아몬드', labelEn: 'Diamond', tag: '500K', shareCode: 'djF8NC0zLTEtMnwsLCwsLCwsLCwsfHw1MDAwMDA', autoBuildOnLoad: true },
];
