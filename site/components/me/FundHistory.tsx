"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFundHistory, type FundChat } from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import ReadAgain from "./ReadAgain";

/**
 * スパチャの控え。**あやとだけ。**
 *
 * ## なぜ画面が要るのか
 *
 * あやとの言葉（2026-09-11）「アラートボックスをスプシから外した」
 * 「スパチャ履歴はどこで見れる？」。控えは `islandFundSuperChats` に
 * 415件そのまま残っているのに、**1件ずつを見る道がスプレッドシートしか
 * 無かった。** 外した日から、どこからも見られなくなっていた。
 *
 * ## 最初の1画面に何を置いたか
 *
 * 日付順の羅列ではなく、**日ごとのまとまり**にした。415件を新しい順に
 * 1行ずつ並べても、いちばん知りたい「**その晩のぶんは入ったか**」が
 * 数えないと出てこない。入り口が3つ（OBS のアラートボックス・毎晩の
 * 取り込み・手入力）あって、**起動し忘れた晩は1件も入らない**
 * （`docs/nordic-fund.md` 9.3）というのがこの控えのいちばん怖いところで、
 * それは「いちばん新しい日に何件いくら」を見れば一目で分かる。
 *
 * その上に、ぜんぶの件数と額を1行だけ。**豚の貯金箱に入るのは半分**
 * （仕様。`docs/nordic-fund.md` 9.1）なので、そちらも並べる。
 *
 * ## 数はサーバーが数える。並んでいるぶんを足さない
 *
 * 画面が持っているのは読み終えたぶんだけなので、足すと「12件」と出る。
 * 数えられなかったときは **0 ではなく、出さない**
 * （`docs/island-standards.md` 10）。
 *
 * ## 日ごとの合計は、そこまで読み終えた日にだけ出す
 *
 * ページの切れ目は日をまたぐ。いちばん古い組は途中までしか手元に無いので、
 * そこに「2件・1,000円」と書くと**その晩の合計として嘘になる。**
 * 続きがあるあいだ、いちばん下の組だけ数を出さない。
 */

/** 1回目に取る数。**1件が1行**なので、札の下に10行ちょっと。 */
const FIRST = 12;
/** 「もっと見る」1回ぶん。押した人は、まとめて欲しがっている。 */
const STEP = 40;

/** `2026-09-10` → `9月10日`。今年でなければ年から言う。 */
function dayLabel(day: string, thisYear: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "日づけのないぶん";
  const y = Number(day.slice(0, 4));
  const md = `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
  return y === thisYear ? md : `${y}年${md}`;
}

/**
 * 何時に入ったか。**日本時間で出す**（組の見出しの日付が日本時間なので、
 * 開いた場所の時計で出すと、旅先では日付と時刻が別の日を指す）。
 *
 * 時刻を言わないものが2つある。どちらも**打ち込んだ日しか分かっていない**
 * ので、時計を出すとこちらが作った数字になる。
 *   - 手で入れたぶん（`00:00` が入っている）
 *   - 元の控えに日付しか無かったぶん（`T` を持たない）
 */
function timeLabel(c: FundChat): string {
  if (!c.at || !c.at.includes("T") || c.src === "manual") return "";
  const t = new Date(c.at);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** 日ごとのまとまり。**新しい順のまま、同じ日を1つに寄せるだけ。** */
type DayGroup = { day: string; chats: FundChat[]; yen: number };

function groupByDay(chats: FundChat[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const c of chats) {
    const last = out[out.length - 1];
    if (last && last.day === c.day) {
      last.chats.push(c);
      last.yen += c.yen;
    } else {
      out.push({ day: c.day, chats: [c], yen: c.yen });
    }
  }
  /* 並びは書類の id 順なので、同じ日の中の時刻はばらばらに来る。
     組の中だけ、新しい順に直す（`at` の無いものは後ろ）。 */
  for (const g of out) {
    g.chats.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }
  return out;
}

export default function FundHistory() {
  const { token } = useAuth();
  /** 読み終えたぶん。取りにいっている最中は null（0件と区別する） */
  const [chats, setChats] = useState<FundChat[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  /** ぜんぶで何件・いくら。**読めなかったら null。0 にしない** */
  const [all, setAll] = useState<{ count: number | null; yen: number | null }>({
    count: null,
    yen: null,
  });
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  /** 続きを取りにいっている最中。**骨には戻さない**（読めているので） */
  const [adding, setAdding] = useState(false);
  /** 続きが取れなかった。1行だけ言う（面ごと落とさない） */
  const [addBad, setAddBad] = useState(false);
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);

  const thisYear = useMemo(() => new Date().getFullYear(), []);
  /* 続きを押したときに、いま手元にある「次の位置」を使う。
     `useEffect` の中から読むので ref で持つ（依存に入れると読み直しが走る）。 */
  const cursor = useRef<string | null>(null);

  /* ## 落ちたら、押されるまで待たずに読み直す（`island-misses.md` 決めごと9）
   *
   * 旅先は電波が細いのがふつうの状態。`catch` で空にすると、届かなかった
   * 日に「まだ1件も入っていません」と言い切ることになる。 */
  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(getFundHistory(t, null, FIRST));
        if (gone) return;
        ok = true;
        miss = 0;
        setChats(r.chats);
        setAll({ count: r.count, yen: r.yen });
        setMore(r.more);
        setNext(r.next);
        cursor.current = r.next;
        setRead("ok");
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setChats(null);
    setRead("wait");
    setAddBad(false);
    go();

    /* 電波が戻った合図。**画面を開き直させないため。** */
    const wake = () => {
      if (ok || gone) return;
      clearTimeout(wait);
      miss = 0;
      go();
    };
    const onShow = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      gone = true;
      clearTimeout(wait);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [token, again]);

  const addMore = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    setAddBad(false);
    try {
      const t = await withRead(token());
      if (!t) throw new Error("no-token");
      const r = await withRead(getFundHistory(t, cursor.current, STEP));
      setChats((cur) => [...(cur ?? []), ...r.chats]);
      /* 数え直しはこちらでも受ける。押しているあいだに入ることがある */
      if (r.count !== null || r.yen !== null) {
        setAll({ count: r.count, yen: r.yen });
      }
      setMore(r.more);
      setNext(r.next);
      cursor.current = r.next;
    } catch {
      setAddBad(true);
    } finally {
      setAdding(false);
    }
  }, [adding, token]);

  if (read === "down") {
    return (
      <ReadAgain
        what="スパチャの控え"
        onRetry={() => setAgain((n) => n + 1)}
      />
    );
  }
  if (chats === null) {
    return (
      <div className="wait is-row" aria-hidden>
        <span />
        <span />
      </div>
    );
  }
  if (chats.length === 0) {
    return (
      <div className="blank">
        <b>まだ1件も入っていません</b>
        <p>配信でスパチャが来た晩から、ここに並びます。</p>
      </div>
    );
  }

  const groups = groupByDay(chats);

  return (
    <>
      {/* ぜんぶでいくら。**数えられたときだけ出す。** */}
      {all.count !== null && all.yen !== null && (
        <p className="mp-sc-sum">
          ぜんぶで <b>{all.count.toLocaleString("ja-JP")}</b>件{" "}
          <b>{yen(all.yen)}</b>
          <i>貯金箱に入るぶん {yen(Math.floor(all.yen / 2))}</i>
        </p>
      )}

      {groups.map((g, i) => {
        /* いちばん古い組は、続きがあるあいだ途中までしか手元に無い。
           その晩の合計として出すと嘘になるので、数を出さない。 */
        const partial = more && i === groups.length - 1;
        return (
          <div className="mp-sc-day" key={g.day || `none-${i}`}>
            <p className="mp-sc-dayh">
              <b>{dayLabel(g.day, thisYear)}</b>
              {!partial && (
                <i>
                  {g.chats.length}件・{yen(g.yen)}
                </i>
              )}
            </p>
            <ul className="mp-sc-list">
              {g.chats.map((c) => (
                <li key={c.id}>
                  <span className="mp-sc-time">{timeLabel(c)}</span>
                  <span className="mp-sc-who">{c.who}</span>
                  <span className="mp-sc-yen">{yen(c.yen)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {more && next && (
        <button className="mp-sc-more" onClick={addMore} disabled={adding}>
          {adding ? "よみこんでいます…" : "もっと古いぶん"}
        </button>
      )}
      {/* 続きだけ落ちたとき。**面ごと灰色に戻さない**（読めているぶんは出す） */}
      {addBad && <ReadAgain what="続き" quiet />}
    </>
  );
}
