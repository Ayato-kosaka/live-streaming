import type { DailyStat } from './types';

const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbz0RvIKLuuRBCktb8m7RKGk0dD0mzo6DhYFt_32zIMnqWnsLzypvZ99OZY95wQTVtW1/exec?endpoint=daily_user_stats';

export async function fetchDailyStats(): Promise<DailyStat[]> {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  return (raw as unknown[]).filter(
    (r): r is DailyStat =>
      typeof (r as DailyStat).date === 'string' &&
      typeof (r as DailyStat).new_users === 'number' &&
      typeof (r as DailyStat).returning_users === 'number'
  );
}
