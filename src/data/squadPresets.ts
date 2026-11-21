// Share 버튼으로 복사한 URL에서 ?s= 뒤 문자열을 shareCode에 붙여 넣으세요.
// 완성 스쿼드는 autoBuildOnLoad: false, 자동 완성이 필요한 앵커 스쿼드는 true로 설정합니다.
// 초기 샘플은 DB별 카드 ID 차이를 피하는 빈 예산/포메이션 템플릿이며 로드 후 자동 완성합니다.
export interface SquadPreset {
  id: string; labelKo: string; labelEn: string; tag: string;
  shareCode: string; autoBuildOnLoad?: boolean;
}
export const squadPresets: SquadPreset[] = [
  { id: 'BF-60k', labelKo: '블프 4312', labelEn: 'BF 4312', tag: '60K', shareCode: 'djF8NC0zLTEtMnwyOTQuMSwxOTk4MC4xLDY2LjEsMTg5LDg4LjEsMjAwMzgsMTUzLDE5OTY3LjEsNTUsMTM3LDk5fDQsN3wxMDAwMDA', autoBuildOnLoad: false },
  { id: '220k', labelKo: '블프 4312', labelEn: 'BF 4312', tag: '220K', shareCode: 'djF8NC0zLTEtMnwxOTk4MC4xLDcyLjEsOC4xLDU4LjEsODguMSwyMC4xLDI5NiwxNDEuMSwxMzcuMSwxMTcuMSwzMXwxLDV8MzAwMDAw', autoBuildOnLoad: false },
  { id: '150k', labelKo: '블프 4213', labelEn: 'BF 4213', tag: '150k', shareCode: 'djF8NC0yLTEtM3wxOTk4MC4xLDE5OTE0LjEsMTk5NTYuMSw2Ni4xLDIwMzc0LjEsNjg3LjEsNTg2LjEsMTQxLjEsMjAxNTQsNjk1LDQ1MC4xfDQsMTd8MzAwMDAw', autoBuildOnLoad: false },
];
