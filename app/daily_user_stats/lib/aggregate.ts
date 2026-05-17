import type { DailyStat, MonthStat } from './types';

export type BarDatum = {
  label: string;
  new_users: number;
  returning_users: number;
};

export function getLast30Days(data: DailyStat[]): BarDatum[] {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-30).map((r) => ({
    label: r.date.slice(5).replace('-', '/'),
    new_users: r.new_users,
    returning_users: r.returning_users,
  }));
}

export function formatMonthly(data: MonthStat[]): BarDatum[] {
  return data.map((r) => ({
    label: `${parseInt(r.month.slice(5), 10)}月`,
    new_users: r.new_users,
    returning_users: r.returning_users,
  }));
}
