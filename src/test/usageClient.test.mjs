import assert from 'assert';

function normalizePlanName(planName) {
  return planName.trim().toLowerCase();
}

function isTeamPlanName(planName) {
  const normalized = normalizePlanName(planName);
  return normalized === 'team' || normalized === 'enterprise' || normalized === 'business';
}

function isTeamAccount(planName, spend) {
  if (isTeamPlanName(planName)) return true;
  if (spend?.limitType === 'team') return true;
  const pooled = spend?.pooledLimit;
  return typeof pooled === 'number' && Number.isFinite(pooled) && pooled > 0;
}

function needsRequestBasedFallback(raw, planName) {
  if (raw.enabled === false) return false;
  const normalized = normalizePlanName(planName);
  const planUsage = raw.planUsage;
  const hasPlanUsage = !!planUsage;
  const limitCents = hasPlanUsage ? planUsage.limit : null;
  const hasPlanUsageLimit = typeof limitCents === 'number' && Number.isFinite(limitCents) && limitCents > 0;
  const hasTotalUsagePercent =
    hasPlanUsage && typeof planUsage.totalPercentUsed === 'number' && Number.isFinite(planUsage.totalPercentUsed);
  if ((!hasPlanUsage || !hasPlanUsageLimit) && (normalized === 'enterprise' || normalized === 'team')) return true;
  if (hasPlanUsage && !hasPlanUsageLimit && !hasTotalUsagePercent) return true;
  return false;
}

assert.ok(isTeamPlanName('Team'));
assert.ok(isTeamPlanName('enterprise'));
assert.ok(isTeamAccount('Pro+', { limitType: 'team' }));
assert.ok(isTeamAccount('Pro+', { pooledLimit: 50000 }));
assert.ok(needsRequestBasedFallback({ enabled: true, planUsage: { totalPercentUsed: 10 } }, 'Team'));

console.log('usageClient tests passed');
