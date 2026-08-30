export type BudgetLevel = 'unlimited' | 'safe' | 'warning' | 'over';

export interface BudgetStatus {
  percentage: number;
  displayPercentage: number;
  overAmount: number;
  level: BudgetLevel;
}

export function calculateBudgetStatus(totalCost: number, targetBudget: number): BudgetStatus {
  const safeCost = Math.max(0, Number(totalCost) || 0);
  const safeBudget = Math.max(0, Number(targetBudget) || 0);
  if (safeBudget === 0) return { percentage: 0, displayPercentage: 0, overAmount: 0, level: 'unlimited' };

  const percentage = (safeCost / safeBudget) * 100;
  return {
    percentage,
    displayPercentage: Math.min(100, percentage),
    overAmount: Math.max(0, safeCost - safeBudget),
    level: percentage > 100 ? 'over' : percentage >= 80 ? 'warning' : 'safe',
  };
}
