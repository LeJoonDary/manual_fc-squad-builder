export type BudgetLevel = 'unlimited' | 'safe' | 'warning' | 'over';

export interface BudgetStatus {
  percentage: number;
  displayPercentage: number;
  overAmount: number;
  level: BudgetLevel;
}

/** UI values are always finite, non-negative numbers. */
export function safeBudgetNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
export function parseBudgetInput(value: string): number {
  const digits = value.replace(/[^0-9]/g, '');
  return safeBudgetNumber(digits === '' ? 0 : Number.parseInt(digits, 10));
}
export function formatBudgetNumber(value: unknown): string {
  return safeBudgetNumber(value).toLocaleString('en-US');
}
export function calculateBudgetStatus(totalCost: number, targetBudget: number): BudgetStatus {
  const safeCost = safeBudgetNumber(totalCost);
  const safeBudget = safeBudgetNumber(targetBudget);
  if (safeBudget === 0) return { percentage: 0, displayPercentage: 0, overAmount: 0, level: 'unlimited' };
  const percentage = Math.min(1, safeCost / safeBudget) * 100;
  return {
    percentage,
    displayPercentage: percentage,
    overAmount: Math.max(0, safeCost - safeBudget),
    level: safeCost > safeBudget ? 'over' : percentage >= 80 ? 'warning' : 'safe',
  };
}
