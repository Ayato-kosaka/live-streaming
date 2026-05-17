import type { DailyStat, MonthStat, Summary } from './types';

const BASE =
  'https://script.google.com/macros/s/AKfycbz0RvIKLuuRBCktb8m7RKGk0dD0mzo6DhYFt_32zIMnqWnsLzypvZ99OZY95wQTVtW1/exec';

async function get<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE}?endpoint=${endpoint}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchAllStats(): Promise<{
  daily: DailyStat[];
  monthly: MonthStat[];
  summary: Summary;
}> {
  const [daily, monthly, summary] = await Promise.all([
    get<unknown[]>('daily_30d'),
    get<unknown[]>('monthly_12m'),
    get<Record<string, unknown>>('summary'),
  ]);

  return {
    daily: (daily as unknown[]).filter(
      (r): r is DailyStat =>
        typeof (r as DailyStat).date === 'string' &&
        typeof (r as DailyStat).new_users === 'number' &&
        typeof (r as DailyStat).returning_users === 'number'
    ),
    monthly: (monthly as unknown[]).filter(
      (r): r is MonthStat =>
        typeof (r as MonthStat).month === 'string' &&
        typeof (r as MonthStat).new_users === 'number' &&
        typeof (r as MonthStat).returning_users === 'number'
    ),
    summary: summary as Summary,
  };
}
