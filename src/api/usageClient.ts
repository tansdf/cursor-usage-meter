import { buildWorkosSessionCookie } from '../auth/cursorAuth';
import { API_BASE_URL } from '../config';

const DASHBOARD_SERVICE = '/aiserver.v1.DashboardService';
const REST_USAGE_URL = 'https://cursor.com/api/usage';

interface PlanUsageRaw {
  totalSpend?: number;
  includedSpend?: number;
  bonusSpend?: number;
  remaining?: number;
  limit?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
}

interface SpendLimitUsageRaw {
  individualLimit?: number;
  individualUsed?: number;
  individualRemaining?: number;
  pooledLimit?: number;
  pooledUsed?: number;
  pooledRemaining?: number;
  limitType?: string;
}

interface CurrentPeriodUsageRaw {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  planUsage?: PlanUsageRaw;
  spendLimitUsage?: SpendLimitUsageRaw;
  enabled?: boolean;
}

interface PlanInfoRaw {
  planInfo?: {
    planName?: string;
  };
}

interface RequestUsageModelRaw {
  numRequests?: number;
  maxRequestUsage?: number;
}

interface RequestUsageRaw {
  'gpt-4'?: RequestUsageModelRaw;
  startOfMonth?: string;
}

export type AccountKind = 'individual' | 'team' | 'request-based';

export interface UsageSnapshot {
  planName: string;
  accountKind: AccountKind;
  totalPercentUsed: number;
  totalUsedDollars: number | null;
  totalLimitDollars: number | null;
  requestsUsed: number | null;
  requestsLimit: number | null;
  autoPercentUsed: number | null;
  apiPercentUsed: number | null;
  onDemandUsedDollars: number | null;
  onDemandLimitDollars: number | null;
  billingCycleStart: Date | null;
  billingCycleEnd: Date | null;
  isTeam: boolean;
}

function connectHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
  };
}

async function postJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: connectHeaders(token),
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`Cursor API error ${response.status}`);
  }
  return (await response.json()) as T;
}

function parseUnixMs(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const ms = Number(value);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms);
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizePlanName(planName: string): string {
  return planName.trim().toLowerCase();
}

export function isTeamPlanName(planName: string): boolean {
  const normalized = normalizePlanName(planName);
  return normalized === 'team' || normalized === 'enterprise' || normalized === 'business';
}

export function isTeamAccount(planName: string, spend: SpendLimitUsageRaw | undefined): boolean {
  if (isTeamPlanName(planName)) {
    return true;
  }
  if (spend?.limitType === 'team') {
    return true;
  }
  const pooled = finiteOrNull(spend?.pooledLimit);
  return pooled !== null && pooled > 0;
}

function computePlanUsedCents(planUsage: PlanUsageRaw): number | null {
  const totalSpend = finiteOrNull(planUsage.totalSpend);
  if (totalSpend !== null) {
    return totalSpend;
  }
  const includedSpend = finiteOrNull(planUsage.includedSpend);
  if (includedSpend !== null) {
    return includedSpend;
  }
  const limit = finiteOrNull(planUsage.limit);
  const remaining = finiteOrNull(planUsage.remaining);
  if (limit !== null && remaining !== null) {
    return limit - remaining;
  }
  return null;
}

function computeTotalPercent(planUsage: PlanUsageRaw, planUsedCents: number | null, limitCents: number | null): number {
  const direct = finiteOrNull(planUsage.totalPercentUsed);
  if (direct !== null) {
    return direct;
  }
  if (planUsedCents !== null && limitCents !== null && limitCents > 0) {
    return (planUsedCents / limitCents) * 100;
  }
  const includedSpend = finiteOrNull(planUsage.includedSpend);
  const limit = finiteOrNull(planUsage.limit);
  if (includedSpend !== null && limit !== null && limit > 0) {
    return (includedSpend / limit) * 100;
  }
  return 0;
}

function parseOnDemand(spend: SpendLimitUsageRaw | undefined, isTeam: boolean) {
  if (!spend) {
    return { onDemandUsedDollars: null, onDemandLimitDollars: null };
  }

  if (isTeam) {
    const pooledLimit = finiteOrNull(spend.pooledLimit);
    const pooledRemaining = finiteOrNull(spend.pooledRemaining);
    if (pooledLimit !== null && pooledLimit > 0) {
      const used = pooledLimit - (pooledRemaining ?? 0);
      return {
        onDemandUsedDollars: centsToDollars(used),
        onDemandLimitDollars: centsToDollars(pooledLimit),
      };
    }
  }

  const individualLimit = finiteOrNull(spend.individualLimit);
  const individualUsed = finiteOrNull(spend.individualUsed);
  if (individualLimit !== null && individualLimit > 0) {
    return {
      onDemandUsedDollars: centsToDollars(individualUsed ?? 0),
      onDemandLimitDollars: centsToDollars(individualLimit),
    };
  }

  return { onDemandUsedDollars: null, onDemandLimitDollars: null };
}

export function needsRequestBasedFallback(raw: CurrentPeriodUsageRaw, planName: string): boolean {
  if (raw.enabled === false) {
    return false;
  }

  const normalized = normalizePlanName(planName);
  const planUsage = raw.planUsage;
  const hasPlanUsage = !!planUsage;
  const limitCents = hasPlanUsage ? finiteOrNull(planUsage.limit) : null;
  const hasPlanUsageLimit = limitCents !== null && limitCents > 0;
  const hasTotalUsagePercent =
    hasPlanUsage && finiteOrNull(planUsage.totalPercentUsed) !== null;

  if ((!hasPlanUsage || !hasPlanUsageLimit) && (normalized === 'enterprise' || normalized === 'team')) {
    return true;
  }

  if (hasPlanUsage && !hasPlanUsageLimit && !hasTotalUsagePercent) {
    return true;
  }

  return false;
}

export function parseConnectUsage(raw: CurrentPeriodUsageRaw, planName: string): UsageSnapshot {
  const planUsage = raw.planUsage ?? {};
  const spend = raw.spendLimitUsage;
  const isTeam = isTeamAccount(planName, spend);
  const limitCents = finiteOrNull(planUsage.limit);
  const planUsedCents = computePlanUsedCents(planUsage);
  const totalPercentUsed = computeTotalPercent(planUsage, planUsedCents, limitCents);
  const onDemand = parseOnDemand(spend, isTeam);

  let totalUsedDollars: number | null = null;
  let totalLimitDollars: number | null = null;
  if (isTeam && planUsedCents !== null && limitCents !== null && limitCents > 0) {
    totalUsedDollars = centsToDollars(planUsedCents);
    totalLimitDollars = centsToDollars(limitCents);
  }

  return {
    planName,
    accountKind: isTeam ? 'team' : 'individual',
    totalPercentUsed,
    totalUsedDollars,
    totalLimitDollars,
    requestsUsed: null,
    requestsLimit: null,
    autoPercentUsed: finiteOrNull(planUsage.autoPercentUsed),
    apiPercentUsed: finiteOrNull(planUsage.apiPercentUsed),
    onDemandUsedDollars: onDemand.onDemandUsedDollars,
    onDemandLimitDollars: onDemand.onDemandLimitDollars,
    billingCycleStart: parseUnixMs(raw.billingCycleStart),
    billingCycleEnd: parseUnixMs(raw.billingCycleEnd),
    isTeam,
  };
}

export function parseRequestBasedUsage(raw: RequestUsageRaw, planName: string): UsageSnapshot | null {
  const gpt4 = raw['gpt-4'];
  const requestsLimit = finiteOrNull(gpt4?.maxRequestUsage);
  const requestsUsed = finiteOrNull(gpt4?.numRequests) ?? 0;
  if (requestsLimit === null || requestsLimit <= 0) {
    return null;
  }

  const totalPercentUsed = (requestsUsed / requestsLimit) * 100;
  const cycleStart = raw.startOfMonth ? parseUnixMs(raw.startOfMonth) : null;
  const billingCycleEnd = cycleStart ? new Date(cycleStart.getTime() + 30 * 24 * 60 * 60 * 1000) : null;

  return {
    planName,
    accountKind: 'request-based',
    totalPercentUsed,
    totalUsedDollars: null,
    totalLimitDollars: null,
    requestsUsed,
    requestsLimit,
    autoPercentUsed: null,
    apiPercentUsed: null,
    onDemandUsedDollars: null,
    onDemandLimitDollars: null,
    billingCycleStart: cycleStart,
    billingCycleEnd,
    isTeam: isTeamPlanName(planName),
  };
}

async function fetchRequestBasedUsage(token: string): Promise<RequestUsageRaw | null> {
  const session = buildWorkosSessionCookie(token);
  if (!session) {
    return null;
  }

  const response = await fetch(`${REST_USAGE_URL}?user=${encodeURIComponent(session.userId)}`, {
    method: 'GET',
    headers: {
      Cookie: `WorkosCursorSessionToken=${session.cookie}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as RequestUsageRaw;
}

export async function fetchUsageSnapshot(token: string): Promise<UsageSnapshot> {
  const usageUrl = `${API_BASE_URL}${DASHBOARD_SERVICE}/GetCurrentPeriodUsage`;
  const planUrl = `${API_BASE_URL}${DASHBOARD_SERVICE}/GetPlanInfo`;

  const usageRaw = await postJson<CurrentPeriodUsageRaw>(usageUrl, token);
  const planRaw = await postJson<PlanInfoRaw>(planUrl, token).catch(() => ({ planInfo: { planName: 'Pro+' } }));
  const planName = planRaw.planInfo?.planName?.trim() || 'Pro+';

  if (needsRequestBasedFallback(usageRaw, planName)) {
    const requestRaw = await fetchRequestBasedUsage(token);
    if (requestRaw) {
      const requestSnapshot = parseRequestBasedUsage(requestRaw, planName);
      if (requestSnapshot) {
        return requestSnapshot;
      }
    }
    throw new Error('Team or enterprise usage data unavailable from Cursor API.');
  }

  if (usageRaw.enabled === false || !usageRaw.planUsage) {
    throw new Error('No active Cursor subscription.');
  }

  const snapshot = parseConnectUsage(usageRaw, planName);
  if (snapshot.isTeam && snapshot.totalLimitDollars === null) {
    const requestRaw = await fetchRequestBasedUsage(token);
    if (requestRaw) {
      const requestSnapshot = parseRequestBasedUsage(requestRaw, planName);
      if (requestSnapshot) {
        return requestSnapshot;
      }
    }
    throw new Error('Team usage limits missing from Cursor API.');
  }

  return snapshot;
}
