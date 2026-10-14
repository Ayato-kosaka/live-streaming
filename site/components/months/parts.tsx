import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { charImg } from "@/lib/charImg";
import type { Month, MonthAttend, MonthTip } from "@/content/months";
import { TAP_GOAL } from "@/content/months";

/**
 * 月ごとのふりかえりの部品。
 *
 * ## 額を出してよいのは、この面だけ
 *
 * `docs/island-money.md` 2章の例外。出すのは**貢献額**（スパチャ ÷ 2 + Doneru）で、
 * 実額ではない。式は `python/fund_box.py` の `viewer_yen()` ひとつで、
 * ここは焼いた値を出すだけ。**ほかの面へ持ち出さない。**
 *
 * ## 個人別のコメント数は、1か所も出さない
 *
 * `/monthly-review` 3章。出席は「何日来たか」だけ。
 */

/** 円。3桁区切り。 */
export const yen = (n: number) => n.toLocaleString("ja-JP");

/**
 * 「5.3万」。**狭いところで数を並べるとき用。**
 *
 * 390px に9本の棒を並べると1本 40px しかなく、`103,394` は隣とくっつく
 * （実際にくっついた）。小数1桁の万なら4〜5字で収まる。
 */
export const man = (n: number) => `${(n / 10000).toFixed(1)}万`;

/** `2026-01` → `2026年1月`。 */
export const monthLabel = (m: Month) => `${m.year}年${m.month}月`;

/** `2026-09-25` → `9/25`。 */
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const WD = ["日", "月", "火", "水", "木", "金", "土"];
/** `2026-09-25` → `金`。焼き込みなので、ここは日付から引いても古くならない。 */
export const wd = (d: string) => WD[new Date(`${d}T00:00:00+09:00`).getDay()];

/**
 * 顔。取れなかったら頭文字の丸に落ちる。
 *
 * **このサンドボックスからは絵の置き場に出られない**ので、
 * 手元で撮ると全員が頭文字になる。本番では出る（`CLAUDE.md`）。
 */
export function Face({ icon, name, size = 40 }: { icon?: string; name: string; size?: number }) {
  if (!icon) {
    return (
      <span className="mface is-none" style={{ width: size, height: size }} aria-hidden>
        {name.replace(/^@/, "").slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className="mface"
      src={charImg(icon, size > 72 ? 256 : 128)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

/**
 * 表彰台。1位・2位・3位を3枚で。
 *
 * **同額は同順位**なので、1位が2人いる月がある。そのときは2枚とも1位の段に並べる。
 */
export function Podium({ rows, unit }: { rows: { rank: number; name: string; v: string; icon?: string }[]; unit: string }) {
  return (
    <ol className="mpod">
      {rows.map((r, i) => (
        <li key={`${r.rank}-${r.name}-${i}`} className={`mpod-i is-r${Math.min(r.rank, 3)}`}>
          <span className="mpod-no">
            <Icon name={r.rank === 1 ? "trophy" : "medal"} size={r.rank === 1 ? 26 : 20} />
            <b>{r.rank}</b>
          </span>
          <Face icon={r.icon} name={r.name} size={r.rank === 1 ? 80 : 64} />
          <b className="mpod-n">{r.name}</b>
          <span className="mpod-v">
            {r.v}
            <i>{unit}</i>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 4位から下。並ぶだけなので、マスに厚みは付けない（`island-design.md` 3-3 の例外）。 */
export function RankList({ rows }: { rows: { rank: number; name: string; v: string; unit: string; icon?: string }[] }) {
  return (
    <ol className="mrank">
      {rows.map((r, i) => (
        <li key={`${r.rank}-${r.name}-${i}`}>
          <span className="mrank-no">{r.rank}</span>
          <Face icon={r.icon} name={r.name} size={30} />
          <b>{r.name}</b>
          <span className="mrank-v">
            {r.v}
            <i>{r.unit}</i>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 投げ銭ランキングを、表彰台＋一覧に割る。 */
export function Tips({ m }: { m: Month }) {
  const top = m.tips.filter((t) => t.r <= 3);
  const rest = m.tips.filter((t) => t.r > 3);
  return (
    <>
      <Podium rows={top.map((t) => ({ rank: t.r, name: t.n, v: yen(t.y), icon: t.i }))} unit="円" />
      {rest.length > 0 && (
        <RankList rows={rest.map((t) => ({ rank: t.r, name: t.n, v: yen(t.y), unit: "円", icon: t.i }))} />
      )}
      <p className="mnote">
        ぜんぶで {yen(m.tipTotal)}円。{m.tips.length}人が出してくれた。
      </p>
    </>
  );
}

/** その人を指す鍵。絵があればそれ、無ければ呼び名。**呼び名は変わるので絵が先。** */
const who = (a: MonthAttend) => a.i ?? a.n;

/**
 * 皆勤が何ヶ月続いているか。**当月から遡って、途切れるまで。**
 *
 * `MONTHS` は新しい月が先頭なので、1つ後ろが1つ前の月。
 * 月はすき間なく並んでいる（`python/build_monthly.py` の `FINALS`）ので、
 * 並びの隣がそのまま「前の月」になる。
 */
export function perfectStreak(months: Month[], i: number, a: MonthAttend): number {
  const key = who(a);
  let n = 1;
  for (let j = i + 1; j < months.length; j++) {
    const m = months[j];
    if (!m.attend.some((x) => x.d >= m.denom && who(x) === key)) break;
    n += 1;
  }
  return n;
}

/**
 * 皆勤賞（分母いっぱい来た人）。1人もいない月は出さない。
 *
 * **出席日数リストの後ろに置く**（あやと 2026-09-27、#656）。
 * 先に全員の日数を出して、いちばん上を最後に立てる。
 * 逆にすると、皆勤賞のあとにリストが続いて盛り上がりが下がる。
 *
 * **「何ヶ月連続か」を必ず出す**（あやと 2026-09-26）。
 * ただし**1ヶ月目は「1ヶ月連続」と書かない**——連続は2つ目から数えるもので、
 * 初めての人には別の言葉と別の色が要る。
 */
export function Perfect({ months, i }: { months: Month[]; i: number }) {
  const m = months[i];
  const all = m.attend.filter((a) => a.d >= m.denom);
  if (all.length === 0) return null;
  return (
    <ul className="mkin">
      {all.map((a) => {
        const k = perfectStreak(months, i, a);
        return (
          <li key={a.n}>
            <span className="mkin-tag">
              <Icon name="crown" size={16} />
              皆勤
            </span>
            <Face icon={a.i} name={a.n} size={72} />
            <b>{a.n}</b>
            <span className="mkin-d">
              {a.d}
              <i>/{m.denom}日</i>
            </span>
            <span className={`mkin-k${k === 1 ? " is-first" : ""}`}>
              {k === 1 ? "はじめての皆勤賞" : `${k} ヶ月連続`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 出席日数の一覧。**日数だけ。コメント数は持たないし、出さない。** */
export function Attend({ rows, denom }: { rows: MonthAttend[]; denom: number }) {
  return (
    <ul className="matt">
      {rows.map((a) => (
        <li key={a.n}>
          <Face icon={a.i} name={a.n} size={30} />
          <b>{a.n}</b>
          <span className="matt-d" style={{ ["--w" as string]: `${Math.round((a.d / denom) * 100)}%` }}>
            <i>{a.d}</i>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * タップタップ。目標5万に対してどうだったか。
 *
 * 棒は 5万 を満タンとして、超えた月はそのぶん伸びる（最大3倍で頭打ち。
 * 16万の月に合わせて目盛りを取ると、5万の月の棒が 1/3 になって、
 * 「届いた」ことが読めなくなる）。
 */
export function Taps({ taps }: { taps: number }) {
  const ratio = taps / TAP_GOAL;
  const w = Math.min(ratio / 3, 1) * 100;
  const over = taps - TAP_GOAL;
  return (
    <div className="mtap">
      <div className="mtap-n">
        <b>{yen(taps)}</b>
        <i>タップ</i>
      </div>
      <div className="mtap-bar">
        <span className="mtap-fill" style={{ width: `${w}%` }} />
        <span className="mtap-goal" style={{ left: `${(1 / 3) * 100}%` }} aria-hidden />
      </div>
      <p className="mtap-note">
        {over >= 0 ? `目標の5万を ${yen(over)} こえた` : `5万まで あと ${yen(-over)}`}
      </p>
    </div>
  );
}

/** その月の流れ。1日1行。同じ日に何枠あってもまとめる。 */
export function Flow({ m }: { m: Month }) {
  const days: { d: string; items: Month["streams"] }[] = [];
  for (const s of m.streams) {
    const last = days[days.length - 1];
    if (last && last.d === s.d) last.items.push(s);
    else days.push({ d: s.d, items: [s] });
  }

  /* 日づけは隣の `<span>` にあって、リンクの中には入っていない。
     読み上げがリンクの字だけを並べて読むと、**同じ題名の枠は1文字も
     違わない行**になる——1か月に5本そうなった月がある（2026-05）。
     題名は YouTube に実在するものなので直せない
     （`docs/island-design.md` 1章の唯一の例外）ので、
     **読み上げる名前のほうに日づけを足す。** 同じ日に2本あるぶんは
     さらに何本目かを足す。
     **ぶつかっていない枠には何も足さない**——どれにも日づけが付くと、
     読み上げがうるさいだけで見分けの役に立たない。 */
  const byTitle = new Map<string, typeof m.streams>();
  for (const s of m.streams) byTitle.set(s.title, [...(byTitle.get(s.title) ?? []), s]);
  const label = (s: Month["streams"][number]) => {
    const all = byTitle.get(s.title) ?? [];
    if (all.length < 2) return undefined;
    const sameDay = all.filter((x) => x.d === s.d);
    const nth = sameDay.length > 1 ? `（この日の${sameDay.indexOf(s) + 1}本目）` : "";
    return `${md(s.d)} ${s.title}${nth}`;
  };

  return (
    <ol className="mflow">
      {days.map((day) => (
        <li key={day.d}>
          <span className="mflow-d">
            <b>{md(day.d)}</b>
            <i>{wd(day.d)}</i>
          </span>
          <span className="mflow-b">
            {day.items.map((s) => (
                <a
                  key={s.v}
                  className="mflow-t"
                  href={`https://www.youtube.com/watch?v=${s.v}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label(s)}
                >
                  {/* 実在する題名の引用。島の決まりで絵文字を落とさない */}
                  <b data-quote="title">{s.title}</b>
                  <Icon name="external" size={13} className="mflow-go" />
                </a>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 月から月へ渡る札。前の月・次の月・一覧。 */
export function MonthNav({ prev, next }: { prev?: Month; next?: Month }) {
  return (
    <div className="tiles">
      {prev && (
        <Link prefetch={false} className="tile" href={`/months/${prev.key}`} style={{ ["--tile" as string]: "var(--roof-sky)" }}>
          <Icon name="left" size={20} className="tile-icon" />
          <span className="tile-text">
            <b>{monthLabel(prev)}</b>
            <i>ひとつ前のふりかえり</i>
          </span>
        </Link>
      )}
      {next && (
        <Link prefetch={false} className="tile" href={`/months/${next.key}`} style={{ ["--tile" as string]: "var(--roof-mint)" }}>
          <Icon name="right" size={20} className="tile-icon" />
          <span className="tile-text">
            <b>{monthLabel(next)}</b>
            <i>ひとつ後のふりかえり</i>
          </span>
        </Link>
      )}
      <Link prefetch={false} className="tile" href="/months" style={{ ["--tile" as string]: "var(--roof-gold)" }}>
        <Icon name="calendar" size={20} className="tile-icon" />
        <span className="tile-text">
          <b>ほかの月</b>
          <i>ならべて見る</i>
        </span>
        <Icon name="right" size={15} className="tile-go" />
      </Link>
    </div>
  );
}

export type { MonthTip };
