export type Language = 'ko' | 'en';
export const translations = {
  en: {
    playerDb: {
      title: 'PLAYER DATABASE', subtitle: 'Player DB', searchResult: 'Search Results',
      resultCount: 'Showing {current} of {total} players', resetAll: 'Reset All',
      filters: {
        ovrPrice: 'OVR / Price', positionRoles: 'Position / Roles', smWf: 'SM / WF', playstyles: 'PlayStyles',
        affiliation: 'Affiliation', cardRarity: 'Card Rarity', detailedStats: 'Detailed Stats', physicalBody: 'Physical & Body',
      },
      positionModal: {
        title: 'Select Positions', subtitle: 'Select multiple positions to filter',
        onlyPrimary: 'Only Primary Positions', hasAllSelected: 'Has All Selected Positions',
      },
    },
    cardActions: {
      lock: 'Lock', unlock: 'Unlock', owned: 'Owned (0 C Cost)', notOwned: 'Not Owned (Cost Included)',
      exclude: 'Exclude from Auto Build', removeExclusion: 'Include in Auto Build', details: 'Player Details',
      swapPosition: 'Change Position', remove: 'Remove Player',
    },
    toasts: {
      excludedSuccess: "Excluded from auto build. Click again or use 'Manage Excluded Cards' on the right to remove the exclusion.",
      excludedRemoved: 'Removed from auto build exclusions.', playerAdded: '{position} assigned to {name}.',
      playerRemoved: '{name} removed from squad.', playerOwned: '{name} marked as owned.', playerNotOwned: '{name} marked as not owned.',
    },
    nav: { builder: 'Squad Builder', players: 'Players', guide: 'Guide' },
    squad: {
      title: 'SQUAD BUILDER', subtitle: 'Select a position to add a player.',
      appliedMsg: 'Applied the auto-built squad of {count} players and manager settings.',
      slotSave: 'Slot {num} + Save', targetBudget: 'TARGET BUDGET', maxBudget: 'Max Budget',
      used: 'Used', remaining: 'Remaining', minChem: 'Min Chemistry Target',
      excludedCards: 'Excluded Cards', advancedSettings: 'Advanced Settings', resetSettings: 'Reset Settings',
      autoBuild: '✨ Auto Build Squad', clearAll: 'Clear All', totalCost: 'TOTAL COST', teamChem: 'TEAM CHEMISTRY',
      addManager: '+ Add Manager', smartManager: 'Smart Manager', formation: 'Formation',
      successMsg: 'Squad built successfully! Total Cost: {cost} C - Chemistry: {chem}',
      failMsg: 'No squad reached the chemistry target ({current}/{target}). Your current squad was kept. Adjust your budget or requirements and try again.',
      synergyClub: 'CLUB', synergyLeague: 'LEAGUE', synergyNation: 'NATION',
      synergyEmpty: 'Place players to activate chemistry points.',
    },
    modals: {
      excludedTitle: 'Excluded Cards Settings', excludedDesc: 'Choose card types or specific cards to exclude from Auto Build.',
      excludeIcons: 'Exclude Icons', excludeHeroes: 'Exclude Heroes', advancedTitle: 'Advanced Builder Settings',
      advancedDesc: 'Configure specific slot requirements such as Playstyles or Roles.',
      save: 'Save Changes', apply: 'Apply', cancel: 'Cancel', close: 'Close', reset: 'Reset', searchPlaceholder: 'Search player name...',
    },
    common: { coins: 'C', confirm: 'Confirm' },
  },
  ko: {
    playerDb: {
      title: '선수 데이터베이스', subtitle: '선수 DB', searchResult: '선수 검색 결과',
      resultCount: '전체 {total}명 중 {current}명 표시', resetAll: '전체 초기화',
      filters: {
        ovrPrice: 'OVR / 가격', positionRoles: '포지션 / 역할', smWf: '개인기 / 약발', playstyles: 'PlayStyles',
        affiliation: '소속', cardRarity: '카드 버전', detailedStats: '세부 스탯', physicalBody: '피지컬 & 체형',
      },
      positionModal: {
        title: '포지션 선택', subtitle: '여러 포지션을 선택하세요',
        onlyPrimary: '주 포지션만 검색', hasAllSelected: '선택한 모든 포지션 보유',
      },
    },
    cardActions: {
      lock: '잠금', unlock: '잠금 해제', owned: '보유 중 (0 C 적용)', notOwned: '미보유 (비용 포함)',
      exclude: '자동 완성에서 제외', removeExclusion: '제외 목록에서 삭제', details: '선수 상세 정보',
      swapPosition: '포지션 변경', remove: '선수 제거',
    },
    toasts: {
      excludedSuccess: "자동 완성에서 제외되었습니다. 다시 클릭하거나 우측의 '제외 카드 설정'에서 제외를 해제할 수 있습니다.",
      excludedRemoved: '자동 완성 제외 목록에서 삭제되었습니다.', playerAdded: '{position}에 {name} 선수를 배치했습니다.',
      playerRemoved: '{name} 선수를 스쿼드에서 제거했습니다.', playerOwned: '{name} 선수를 보유로 표시했습니다.', playerNotOwned: '{name} 선수를 미보유로 표시했습니다.',
    },
    nav: { builder: '스쿼드 빌더', players: '선수 DB', guide: '이용 가이드' },
    squad: {
      title: '스쿼드 빌더', subtitle: '포지션을 클릭하여 선수를 선택하세요.',
      appliedMsg: '{count}명의 선수와 추천 감독으로 자동 완성된 스쿼드입니다.',
      slotSave: '슬롯 {num} 저장', targetBudget: '목표 예산', maxBudget: '최대 예산',
      used: '사용', remaining: '잔여 예산', minChem: '최소 케미스트리 목표',
      excludedCards: '제외 카드 설정', advancedSettings: '고급 조건 설정', resetSettings: '설정 초기화',
      autoBuild: '✨ 스쿼드 자동 완성', clearAll: '스쿼드 비우기', totalCost: '총 소요 비용', teamChem: '팀 케미스트리',
      addManager: '+ 감독 추가', smartManager: '스마트 감독 추천', formation: '포메이션',
      successMsg: '스쿼드 자동 완성 완료! 총 비용: {cost} C - 케미: {chem}',
      failMsg: '목표 케미스트리({current}/{target})를 만족하는 스쿼드를 찾지 못했습니다. 현재 스쿼드가 유지되었습니다. 예산이나 조건을 조정한 후 다시 시도해 주세요.',
      synergyClub: '클럽 시너지', synergyLeague: '리그 시너지', synergyNation: '국가 시너지',
      synergyEmpty: '선수를 배치하면 케미스트리 포인트가 활성화됩니다.',
    },
    modals: {
      excludedTitle: '제외 카드 설정', excludedDesc: '자동 완성 시 제외할 특수 카드나 특정 선수를 설정합니다.',
      excludeIcons: '아이콘(Icon) 제외', excludeHeroes: '히어로(Hero) 제외', advancedTitle: '고급 조건 설정',
      advancedDesc: '각 포지션별 필수 Playstyle 또는 Role 조건을 지정합니다.',
      save: '변경사항 저장', apply: '적용', cancel: '취소', close: '닫기', reset: '초기화', searchPlaceholder: '선수 이름 검색...',
    },
    common: { coins: 'C', confirm: '확인' },
  },
};
