export interface LinkTarget {
  id: string;
  alive: boolean;
}

export interface DistributedDamage {
  targetId: string;
  amount: number;
  propagated: boolean;
}

export function distributeLinkedDamage(
  sourceId: string,
  amount: number,
  targets: readonly LinkTarget[],
  shareRatio: number,
  propagated = false,
): DistributedDamage[] {
  const result: DistributedDamage[] = [{ targetId: sourceId, amount, propagated }];
  if (propagated) return result;
  for (const target of targets) {
    if (!target.alive || target.id === sourceId) continue;
    result.push({ targetId: target.id, amount: amount * shareRatio, propagated: true });
  }
  return result;
}
