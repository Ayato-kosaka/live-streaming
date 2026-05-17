export type DailyStat = {
  date: string;
  new_users: number;
  returning_users: number;
};

export type MonthStat = {
  month: string; // YYYY-MM
  new_users: number;
  returning_users: number;
};

export type Summary = {
  today_new: number;
  today_total: number;
  mau: number;
  all_time: number;
};
