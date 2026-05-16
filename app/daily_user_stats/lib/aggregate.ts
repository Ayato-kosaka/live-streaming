import type { DailyStat } from './types';

function getJapanToday(): string {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function getJapanMonthStart(): string {
  return getJapanToday().slice(0, 8) + '01';
}

// Arithmetic month subtraction — avoids Date timezone issues
function subtractMonths(ym: string, n: number): string {
  const [year, month] = ym.split('-').map(Number);
  let y = year;
  let m = month - n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export type Aggregates = {
  todayNew: number;
  todayTotal: number;
  mau: number;
  allTime: number;
};

export function computeAggregates(data: DailyStat[]): Aggregates {
  const today = getJapanToday();
  const monthStart = getJapanMonthStart();

  const todayRow = data.find((r) => r.date === today);
  const todayNew = todayRow?.new_users ?? 0;
  const todayTotal = (todayRow?.new_users ?? 0) + (todayRow?.returning_users ?? 0);

  const mau = data
    .filter((r) => r.date >= monthStart && r.date <= today)
    .reduce((sum, r) => sum + r.new_users + r.returning_users, 0);

  const allTime = data.reduce((sum, r) => sum + r.new_users + r.returning_users, 0);

  return { todayNew, todayTotal, mau, allTime };
}

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

export function getLast12Months(data: DailyStat[]): BarDatum[] {
  const today = getJapanToday();
  const currentYM = today.slice(0, 7);

  const monthMap: Record<string, { new_users: number; returning_users: number }> = {};
  for (const r of data) {
    const ym = r.date.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { new_users: 0, returning_users: 0 };
    monthMap[ym].new_users += r.new_users;
    monthMap[ym].returning_users += r.returning_users;
  }

  const months: BarDatum[] = [];
  for (let i = 11; i >= 0; i--) {
    const ym = subtractMonths(currentYM, i);
    const m = parseInt(ym.slice(5), 10);
    const entry = monthMap[ym] ?? { new_users: 0, returning_users: 0 };
    months.push({
      label: `${m}月`,
      new_users: entry.new_users,
      returning_users: entry.returning_users,
    });
  }
  return months;
}
