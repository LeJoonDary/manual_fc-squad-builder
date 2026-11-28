// Share 버튼으로 복사한 URL에서 ?s= 뒤 문자열을 shareCode에 붙여 넣으세요.
// 완성 스쿼드는 autoBuildOnLoad: false, 자동 완성이 필요한 앵커 스쿼드는 true로 설정합니다.
// 초기 샘플은 DB별 카드 ID 차이를 피하는 빈 예산/포메이션 템플릿이며 로드 후 자동 완성합니다.
export interface SquadPreset {
  id: string; labelKo: string; labelEn: string; tag: string;
  shareCode: string; autoBuildOnLoad?: boolean;
}
export const squadPresets: SquadPreset[] = [
  { id: '1', labelKo: '알바레즈🔥 4-3-1-2', labelEn: 'Alvarez🔥 4-3-1-2', tag: '250K', shareCode: 'djF8NC0zLTEtMnwyMDcxOS4xLDcyLjEsMjA1NjEuMSwyMDYxOSwxMSw1OCwxMDEsMTQxLDU4NiwyMDQzNiw0fDEwLDI1fDUwMDAwMA', autoBuildOnLoad: false },
  { id: '2', labelKo: '알바레즈🔥 4-3-3(2)', labelEn: 'Alvarez🔥 4-3-3(2)', tag: '250k', shareCode: 'djF8NC0zLTMgKDIpfDIxNSwyMDcxOS4zLDIwNTYwLDgsMTEsMjAzNzQsNTg2LjEsMTQxLDIwMTU0LjEsMTE3LDUwfDEyLDJ8NTAwMDAw', autoBuildOnLoad: false },
  { id: '3', labelKo: '알바레즈🔥 4-2-1-3', labelEn: 'Alvarez🔥 4-2-1-3', tag: '500K', shareCode: 'djF8NC0yLTEtM3wyMDQ4NC4xLDIwNTU5LDIwNjg2LjEsMjA3MTkuMywzNiwyMDE0OCw0MjIsMTQxLDIwMzc4LDIwMjM0LDI4fDExLDMzfDUwMDAwMA', autoBuildOnLoad: false },
  
];
