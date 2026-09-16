export function redistributeBudgetRatios(ratios, group, value) {
  const nextValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const [first, second] = Object.keys(ratios).filter(key => key !== group);
  const remaining = 100 - nextValue;
  const otherTotal = ratios[first] + ratios[second];
  const firstValue = Math.round(remaining * (otherTotal ? ratios[first] / otherTotal : 0.5));
  return { ...ratios, [group]: nextValue, [first]: firstValue, [second]: remaining - firstValue };
}
