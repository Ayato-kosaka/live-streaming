"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addFundChat,
  addFundGoal,
  addFundSpend,
  dropFundGoal,
  dropFundSpend,
  getFundDesk,
  getFundFeed,
  getFundSpends,
  replayFund,
  type FundBox,
  type FundGoal,
  type FundGot,
  type FundSpend,
  type FundSplit,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import ReadAgain, { sayable } from "./ReadAgain";

/**
 * 豚の貯金箱の机。**あやとだけ。**
 *
 * ## 何をする面か（あやと 2026-09-24）
 *
 * > 画面としては、スパチャ・ドネを管理する画面で、スパチャ・ドネの履歴が
 * > 見れたい。リアルタイムで更新されて、メッセージが見れたり、再アラート
 * > 出来ても良いかも。（たまに配信中見逃すので。）
 * > あとは、目標・出費管理タブですね。今の目標に対する総金額（豚にでてる
 * > やつ）も内訳付きで出したい。
 *
 * **札は2つ。** 配信中に開くほう（スパチャ・ドネ）と、配信の前後に開くほう
 * （目標・出費）。用事の違うものを1枚に積まない
 * （`docs/island-standards.md` 7章）。
 *
 * ## リアルタイムは、聞きにいく形
 *
 * `onSnapshot` は持ち込まない。島の「いま居る人」が同じことを REST で
 * やっていて（`components/island/HereFolks.tsx`）、**届く中身は同じ、
 * 違うのは遅れだけ**という実測がある。借りる決めは3つ。
 *
 * - **静かなときは間隔を空ける**（直近2分に何も来ていなければ20秒に1回）
 * - **見えていないあいだは聞かない**（裏に回したタブ）
 * - **戻ってきたら、その場で1回聞く**（20秒待たせない）
 *
 * 聞くのは「前に見たいちばん新しい時刻より後」だけなので、
 * 何も来ていない回は0件で返る。
 *
 * ## もう一度出す
 *
 * **押す前に、配信に何が出るかをそのまま見せる。** 押しどころは2段で、
 * 1段めで中身が開き、2段めで出る。出したあとは、同じ1件の押しどころが
 * 1分のあいだ戻らない（**二度押しで二度出さない**。口のほうにも同じ線が
 * 引いてあって、片方が外れても配信には2回出ない）。
 */

/** 何を開いているか。**配信中に開くほうが先。** */
type Pane = "got" | "money";

const PANES: { id: Pane; label: string }[] = [
  { id: "got", label: "スパチャ・ドネ" },
  { id: "money", label: "目標・出費" },
];

/** 前に開いていた札。次に開いたとき、そこから続けられるように控える。 */
const LAST = "ayato-fund-pane";

/** 1回目に取る履歴の数。1件が2〜3行なので、札の下に数件。 */
const FEED_FIRST = 15;
/** 「もっと古いぶん」1回ぶん。押した人はまとめて欲しがっている。 */
const FEED_STEP = 40;
/** 何か来ているあいだの間隔。島の「いま居る人」と同じ2秒。 */
const POLL_LIVE_MS = 2_000;
/** 静かなときの間隔。同じく20秒。 */
const POLL_IDLE_MS = 20_000;
/** 直近これだけのあいだに何か来ていたら「配信中」とみなす。 */
const LIVE_MS = 2 * 60 * 1_000;
/** 出したあと、同じ1件の押しどころを寝かせる時間。**口の線と同じ。** */
const REPLAY_REST_MS = 60_000;

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;
/** 引く額は、符号を付けて出す。 */
const minus = (n: number) => `−${n.toLocaleString("ja-JP")}円`;

/** 日本時間の今日。旅先の時計で切ると、台帳の日付と1日ずれる。 */
function jstToday(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(
    jst.getDate(),
  ).padStart(2, "0")}`;
}

/** `2026-09-12` → `9/12`。年が違えば年から。 */
function dayLabel(day: string, thisYear: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "日づけなし";
  const y = Number(day.slice(0, 4));
  const md = `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  return y === thisYear ? md : `${y}年 ${md}`;
}

/** `2026-09-12` → `2026年9月`。 */
function monthLabel(day: string): string {
  if (!/^\d{4}-\d{2}/.test(day)) return "日づけのないぶん";
  return `${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月`;
}

/**
 * 何時に来たか。**日本時間で出す**（日付が日本時間なので、開いた場所の
 * 時計で出すと、旅先では日付と時刻が別の日を指す）。
 */
function timeLabel(at: string): string {
  if (!at || !at.includes("T")) return "";
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
}

/** 打たれた字を円にする。入らない字は 0（押しどころが出ないだけ）。 */
function toYen(s: string): number {
  const n = Number(s.replace(/[^\d-]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 月ごとのまとまり。**新しい順のまま、同じ月を1つに寄せるだけ。** */
type Month = { key: string; spends: FundSpend[]; yen: number };

function byMonth(spends: FundSpend[]): Month[] {
  const out: Month[] = [];
  for (const s of spends) {
    const key = monthLabel(s.day);
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.spends.push(s);
      last.yen += s.yen;
    } else {
      out.push({ key, spends: [s], yen: s.yen });
    }
  }
  return out;
}

/** 足した1行を、新しい順のところへ入れ直す。 */
function sortIn(rows: FundSpend[]): FundSpend[] {
  const seen = new Map(rows.map((r) => [r.id, r]));
  return [...seen.values()].sort((a, b) =>
    a.day === b.day ? b.id.localeCompare(a.id) : b.day.localeCompare(a.day),
  );
}

/** 新しい順のまま、同じものを2度並べない。 */
function mergeGot(a: FundGot[], b: FundGot[]): FundGot[] {
  const seen = new Map([...a, ...b].map((g) => [`${g.kind}_${g.id}`, g]));
  return [...seen.values()].sort((x, y) => y.at.localeCompare(x.at));
}

export default function FundDesk() {
  const { token } = useAuth();
  const online = useOnline();
  const [pane, setPane] = useState<Pane>("got");
  const [box, setBox] = useState<FundBox | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [split, setSplit] = useState<FundSplit | null>(null);
  const [spends, setSpends] = useState<FundSpend[] | null>(null);
  const [goals, setGoals] = useState<FundGoal[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addBad, setAddBad] = useState(false);
  const [again, setAgain] = useState(0);
  const cursor = useRef<string | null>(null);
  const thisYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST);
      if (v && PANES.some((p) => p.id === v)) setPane(v as Pane);
    } catch {
      /* 控えられない端末では、スパチャ・ドネから始まるだけ */
    }
  }, []);

  const pick = (id: Pane) => {
    setPane(id);
    try {
      localStorage.setItem(LAST, id);
    } catch {
      /* 控えられなくても、その場では開く */
    }
  };

  /** 書いたあと・何か届いたあとに、額と内訳をその場で出し直す。 */
  const refresh = useCallback(async () => {
    try {
      const t = await withRead(token());
      if (!t) return;
      const r = await withRead(getFundDesk(t));
      setBox(r.box);
      setTotal(r.total);
      setSplit(r.split);
      setGoals(r.goals);
    } catch {
      /* 額が古いまま出るだけ。**書いたことは取り消さない** */
    }
  }, [token]);

  /* 落ちたら、押されるまで待たずに読み直す（`island-misses.md` 決めごと9）。 */
  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(getFundDesk(t));
        if (gone) return;
        ok = true;
        miss = 0;
        setBox(r.box);
        setTotal(r.total);
        setSplit(r.split);
        setSpends(r.spends);
        setGoals(r.goals);
        setMore(r.more);
        cursor.current = r.next;
        setRead("ok");
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setSpends(null);
    setGoals(null);
    setRead("wait");
    go();

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
      const r = await withRead(getFundSpends(t, cursor.current, 40));
      setSpends((cur) => sortIn([...(cur ?? []), ...r.spends]));
      setMore(r.more);
      cursor.current = r.next;
    } catch {
      setAddBad(true);
    } finally {
      setAdding(false);
    }
  }, [adding, token]);

  if (read === "down") {
    return <ReadAgain what="貯金箱" onRetry={() => setAgain((n) => n + 1)} />;
  }
  if (spends === null || goals === null) {
    return (
      <div className="wait is-row" aria-hidden>
        <span />
        <span />
      </div>
    );
  }

  const now = goals.find((g) => !g.to) ?? null;
  const done = goals.filter((g) => g.to);

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。
        </p>
      )}

      {/* いくら入っているか。**読めた欄だけ出す**（0 に倒さない） */}
      <div className="fd-top">
        {total === null ? (
          <p className="fd-total is-off">貯金箱の額は、いま出せません。</p>
        ) : (
          <p className="fd-total">
            貯金箱 <b>{yen(total)}</b>
          </p>
        )}
        {now && pane !== "money" && (
          <p className="fd-goalnow">
            めざす <b>{yen(now.yen)}</b> {now.label}
          </p>
        )}
      </div>

      <div className="fd-tabs is-2" role="tablist" aria-label="貯金箱の中身">
        {PANES.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pane === p.id}
            className={`fd-tab${pane === p.id ? " is-on" : ""}`}
            onClick={() => pick(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === "got" && <GotPane thisYear={thisYear} onChanged={refresh} />}

      {pane === "money" && (
        <MoneyPane
          split={split}
          total={total}
          now={now}
          done={done}
          spends={spends}
          more={more}
          adding={adding}
          addBad={addBad}
          thisYear={thisYear}
          boxKnown={box !== null}
          onMore={addMore}
          onBox={(b) => {
            setBox(b);
            void refresh();
          }}
          onAdd={(s) => setSpends((cur) => sortIn([...(cur ?? []), s]))}
          onDrop={(id) =>
            setSpends((cur) => (cur ?? []).filter((x) => x.id !== id))
          }
          onGoals={setGoals}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------ スパチャ・ドネ（履歴） */

function GotPane({
  thisYear,
  onChanged,
}: {
  thisYear: number;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [got, setGot] = useState<FundGot[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [more, setMore] = useState(false);
  const [noTime, setNoTime] = useState<{ count: number; yen: number } | null>(
    null,
  );
  const [adding, setAdding] = useState(false);
  const [addBad, setAddBad] = useState(false);
  const [again, setAgain] = useState(0);
  /** いま2秒おきに見ているか。**測れることだけ画面に出す** */
  const [live, setLive] = useState(false);
  /** 開いてから何件届いたか */
  const [came, setCame] = useState(0);
  const cursor = useRef<string | null>(null);
  /** いちばん新しい1件の時刻。次はこれより後だけ聞く */
  const since = useRef<string | null>(null);

  /* ## 聞きにいく形（`components/island/HereFolks.tsx` と同じ決め）
   *
   * `onSnapshot` を持ち込まない。**届く中身は同じで、違うのは遅れだけ。**
   * 何か来ているあいだは2秒、静かなときは20秒、裏に回したら聞かない。 */
  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;
    /** 最後に何か届いた時刻。ここから「配信中か」を決める */
    let lastCame = 0;

    const plan = () => {
      if (gone) return;
      const busy = Date.now() - lastCame < LIVE_MS;
      setLive(busy);
      timer = setTimeout(tick, busy ? POLL_LIVE_MS : POLL_IDLE_MS);
    };

    /** 新着だけ聞く。**0件で返るのがふつう。** */
    const tick = async () => {
      if (gone) return;
      // 見えていないあいだは聞かない。戻ってきたら onShow がその場で呼ぶ
      if (document.visibilityState === "hidden") {
        plan();
        return;
      }
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(
          getFundFeed(t, { since: since.current, limit: FEED_FIRST }),
        );
        if (gone) return;
        if (r.got.length > 0) {
          lastCame = Date.now();
          since.current = r.got[0].at;
          setCame((n) => n + r.got.length);
          setGot((cur) => mergeGot(r.got, cur ?? []));
          // 額も内訳も動いたので、上を出し直す
          onChanged();
        }
      } catch {
        /* 1回こけただけ。**灰色に戻さない**（読めているぶんは出したまま） */
      }
      plan();
    };

    /** 1ページ目。**ここだけは骨から始める。** */
    const first = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(getFundFeed(t, { limit: FEED_FIRST }));
        if (gone) return;
        miss = 0;
        setGot(r.got);
        setMore(r.more);
        setNoTime(r.noTime);
        cursor.current = r.next;
        since.current = r.got[0]?.at ?? null;
        setRead("ok");
        plan();
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        timer = setTimeout(first, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setGot(null);
    setRead("wait");
    first();

    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void tick();
    };
    const onNet = () => {
      clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", onNet);
    return () => {
      gone = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("online", onNet);
    };
  }, [token, again, onChanged]);

  const addMore = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    setAddBad(false);
    try {
      const t = await withRead(token());
      if (!t) throw new Error("no-token");
      const r = await withRead(
        getFundFeed(t, { before: cursor.current, limit: FEED_STEP }),
      );
      setGot((cur) => mergeGot(cur ?? [], r.got));
      setMore(r.more);
      if (r.noTime) setNoTime(r.noTime);
      cursor.current = r.next;
    } catch {
      setAddBad(true);
    } finally {
      setAdding(false);
    }
  }, [adding, token]);

  if (read === "down") {
    return <ReadAgain what="履歴" onRetry={() => setAgain((n) => n + 1)} />;
  }
  if (got === null) {
    return (
      <div className="wait is-row" aria-hidden>
        <span />
        <span />
      </div>
    );
  }

  return (
    <>
      {/* いま何秒おきに見ているか。**押しどころではないので厚みは付けない。** */}
      <p className={`fd-live${live ? " is-on" : ""}`}>
        <span className="fd-dot" aria-hidden />
        {live ? "2秒ごとに見ています" : "20秒ごとに見ています"}
        {came > 0 && <i>開いてから {came}件</i>}
      </p>

      {got.length === 0 ? (
        <div className="blank">
          <b>まだ1件も来ていない</b>
          <p>配信でスパチャかドネが来たら、いちばん上に出る。</p>
        </div>
      ) : (
        <ul className="fd-got">
          {got.map((g) => (
            <GotRow key={`${g.kind}_${g.id}`} got={g} thisYear={thisYear} />
          ))}
        </ul>
      )}

      {more && (
        <button className="mp-sc-more" onClick={addMore} disabled={adding}>
          {adding ? "よみこんでいます…" : "もっと古いぶん"}
        </button>
      )}
      {addBad && <ReadAgain what="続き" quiet />}
      {/* 時刻の分からない控え。**並びに出せないので、数と額だけ。** */}
      {!more && noTime && (
        <p className="fd-notime">
          時刻のわからないぶん {noTime.count}件・{yen(noTime.yen)}
        </p>
      )}

      <Fold title="来ていないぶんを足す">
        <ManualChat onDone={() => setAgain((n) => n + 1)} />
      </Fold>
    </>
  );
}

/** もらった1件。**押すと、配信にもう一度出せる。** */
function GotRow({ got, thisYear }: { got: FundGot; thisYear: number }) {
  const { token } = useAuth();
  /** `idle` → `ask`（何が出るかを見せる）→ `sending` → `done` / `same` / `error` */
  const [state, setState] = useState<
    "idle" | "ask" | "sending" | "done" | "same" | "error"
  >("idle");
  const [err, setErr] = useState("");

  /* 出したあと、しばらく押しどころを戻さない。**二度押しで二度出さない**
     （口のほうにも同じ線がある。片方だけでは守りにならない）。 */
  useEffect(() => {
    if (state !== "done" && state !== "same") return;
    const t = setTimeout(() => setState("idle"), REPLAY_REST_MS);
    return () => clearTimeout(t);
  }, [state]);

  const send = async () => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await replayFund({ kind: got.kind, id: got.id }, t);
      setState(r.already ? "same" : "done");
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  return (
    <li className={got.kind === "donation" ? "is-doneru" : undefined}>
      <p className="fd-gothead">
        <span className="fd-gotwhen">
          {dayLabel(got.day, thisYear)} {timeLabel(got.at)}
        </span>
        <span className="fd-gotkind">
          {got.kind === "donation" ? "ドネ" : "スパチャ"}
        </span>
        <span className="fd-gotyen">{yen(got.yen)}</span>
      </p>
      <p className="fd-gotwho">{got.who || "（名前なし）"}</p>
      {got.text && <p className="fd-gottext">{got.text}</p>}

      {state === "ask" ? (
        <div className="fd-replay">
          <p className="fd-replayhead">配信に出すもの</p>
          <p className="fd-replaybody">
            <b>{got.who || "（名前なし）"}</b> {yen(got.yen)}
            {got.text && <i>{got.text}</i>}
          </p>
          <div className="fd-ask">
            <button className="fd-x is-yes" onClick={send}>
              出す
            </button>
            <button className="fd-x" onClick={() => setState("idle")}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button
          className="fd-x fd-again"
          disabled={state === "sending" || state === "done" || state === "same"}
          onClick={() => setState("ask")}
        >
          {state === "sending"
            ? "出しています…"
            : state === "done"
              ? "出しました"
              : state === "same"
                ? "さっき出したばかり"
                : "もう一度出す"}
        </button>
      )}
      {state === "error" && (
        <p className="err">
          <Icon name="alert" size={13} /> 出せませんでした。{err}
        </p>
      )}
    </li>
  );
}

/** 取りこぼしたスパチャを、手で1件足す。 */
function ManualChat({ onDone }: { onDone: () => void }) {
  const { token } = useAuth();
  const [d, put] = useDraft("ayato-fund-chat", { day: "", yen: "", who: "" });
  const [state, setState] = useState<
    "idle" | "sending" | "done" | "same" | "error"
  >("idle");
  const [err, setErr] = useState("");

  const day = d.day || jstToday();
  const y = toYen(d.yen);

  const send = async () => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await addFundChat({ day, yen: y, who: d.who.trim() }, t);
      put({ yen: "", who: "" });
      setState(r.already ? "same" : "done");
      onDone();
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  return (
    <>
      <label className="nph-post-row">
        <span>いつ</span>
        <input
          type="date"
          value={day}
          onChange={(e) => put({ day: e.target.value })}
        />
      </label>
      <label className="nph-post-row">
        <span>いくら</span>
        <input
          type="text"
          inputMode="numeric"
          value={d.yen}
          maxLength={9}
          placeholder="1000"
          onChange={(e) => {
            put({ yen: e.target.value });
            setState("idle");
          }}
        />
      </label>
      <label className="nph-post-row">
        <span>だれから</span>
        <input
          type="text"
          value={d.who}
          maxLength={31}
          placeholder="わからなければ空のまま"
          onChange={(e) => put({ who: e.target.value })}
        />
      </label>
      <button
        className="mp-send"
        disabled={y <= 0 || state === "sending"}
        onClick={send}
      >
        {state === "sending" ? "入れています…" : "入ったことにする"}
      </button>
      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 入れました。
        </p>
      )}
      {state === "same" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 前から入っていた1件でした。増えていません。
        </p>
      )}
      {state === "error" && (
        <p className="err">
          <Icon name="alert" size={13} /> 入れられませんでした。{err}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------- 目標・出費 */

function MoneyPane({
  split,
  total,
  now,
  done,
  spends,
  more,
  adding,
  addBad,
  thisYear,
  boxKnown,
  onMore,
  onBox,
  onAdd,
  onDrop,
  onGoals,
}: {
  split: FundSplit | null;
  total: number | null;
  now: FundGoal | null;
  done: FundGoal[];
  spends: FundSpend[];
  more: boolean;
  adding: boolean;
  addBad: boolean;
  thisYear: number;
  boxKnown: boolean;
  onMore: () => void;
  onBox: (b: FundBox) => void;
  onAdd: (s: FundSpend) => void;
  onDrop: (id: string) => void;
  onGoals: (f: (cur: FundGoal[] | null) => FundGoal[]) => void;
}) {
  return (
    <>
      {/* いまの目標に対する内訳。**合わないものは出さない** */}
      {now && split && (
        <div className="fd-split">
          <p className="fd-splith">
            <b>{now.label}</b>
            {/* めざす額は、この札にも出す。**頭からは消してある**ので、
                ここに無いと目標・出費の札の上から 50,000円 が消える。 */}
            <i>
              めざす {yen(now.yen)}
              <span>{dayLabel(now.from, thisYear)} から</span>
            </i>
          </p>
          <dl className="fd-splitrows">
            <div>
              <dt>開始時点</dt>
              <dd>{yen(split.start)}</dd>
            </div>
            <div>
              <dt>スパチャ</dt>
              <dd>{yen(split.superchat)}</dd>
            </div>
            <div>
              <dt>ドネ</dt>
              <dd>{yen(split.doneru)}</dd>
            </div>
            <div>
              <dt>出費</dt>
              <dd>{minus(split.spend)}</dd>
            </div>
            <div className="is-sum">
              <dt>いま</dt>
              <dd>{yen(split.total)}</dd>
            </div>
          </dl>
        </div>
      )}
      {now && !split && boxKnown && (
        <p className="fd-total is-off">内訳は、いま出せません。</p>
      )}

      <SpendPart
        total={total}
        spends={spends}
        more={more}
        adding={adding}
        addBad={addBad}
        thisYear={thisYear}
        onMore={onMore}
        onBox={onBox}
        onAdd={onAdd}
        onDrop={onDrop}
      />

      <GoalPart
        now={now}
        done={done}
        thisYear={thisYear}
        onBox={onBox}
        onGoals={onGoals}
      />
    </>
  );
}

function SpendPart({
  total,
  spends,
  more,
  adding,
  addBad,
  thisYear,
  onMore,
  onBox,
  onAdd,
  onDrop,
}: {
  total: number | null;
  spends: FundSpend[];
  more: boolean;
  adding: boolean;
  addBad: boolean;
  thisYear: number;
  onMore: () => void;
  onBox: (b: FundBox) => void;
  onAdd: (s: FundSpend) => void;
  onDrop: (id: string) => void;
}) {
  const { token } = useAuth();
  const [d, put] = useDraft("ayato-fund-spend", { day: "", title: "", yen: "" });
  const [state, setState] = useState<
    "idle" | "sending" | "done" | "same" | "error"
  >("idle");
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<string | null>(null);

  const day = d.day || jstToday();
  const y = toYen(d.yen);
  const can = !!d.title.trim() && y > 0 && state !== "sending";

  const send = async () => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await addFundSpend({ day, title: d.title.trim(), yen: y }, t);
      if (r.box) onBox(r.box);
      onAdd(r.spend);
      put({ title: "", yen: "" });
      setState(r.already ? "same" : "done");
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  const drop = async (id: string) => {
    setAsk(null);
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await dropFundSpend(id, t);
      if (r.box) onBox(r.box);
      onDrop(id);
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  const months = byMonth(spends);

  return (
    <>
      <label className="nph-post-row">
        <span>いつ</span>
        <input
          type="date"
          value={day}
          onChange={(e) => put({ day: e.target.value })}
        />
      </label>
      <label className="nph-post-row">
        <span>なにに</span>
        <input
          type="text"
          value={d.title}
          maxLength={60}
          placeholder="宿代"
          onChange={(e) => {
            put({ title: e.target.value });
            setState("idle");
          }}
        />
      </label>
      <label className="nph-post-row">
        <span>いくら</span>
        <input
          type="text"
          inputMode="numeric"
          value={d.yen}
          maxLength={9}
          placeholder="4000"
          onChange={(e) => {
            put({ yen: e.target.value });
            setState("idle");
          }}
        />
      </label>

      {/* 押したら、いくらになるか。**両方読めているときだけ出す。** */}
      {total !== null && y > 0 && (
        <p className="fd-peek">
          {yen(total)} <Icon name="right" size={12} /> <b>{yen(total - y)}</b>
        </p>
      )}

      <button className="mp-send" disabled={!can} onClick={send}>
        {state === "sending" ? "入れています…" : "つかった、と入れる"}
      </button>
      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 入れました。
        </p>
      )}
      {state === "same" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 前から入っていた行でした。増えていません。
        </p>
      )}
      {state === "error" && (
        <p className="err">
          <Icon name="alert" size={13} /> 入れられませんでした。{err}
        </p>
      )}

      {spends.length === 0 ? (
        <div className="blank">
          <b>まだ1行も入っていない</b>
          <p>もらったお金をつかった日に、1行ずつ足していく。</p>
        </div>
      ) : (
        months.map((m) => (
          <div className="fd-month" key={m.key}>
            <p className="fd-monthh">
              <b>{m.key}</b>
              <i>{yen(m.yen)}</i>
            </p>
            <ul className="fd-rows">
              {m.spends.map((s) => (
                <li key={s.id}>
                  <span className="fd-day">{dayLabel(s.day, thisYear)}</span>
                  <span className="fd-title">{s.title}</span>
                  <span className="fd-yen">{yen(s.yen)}</span>
                  {ask === s.id ? (
                    <span className="fd-ask">
                      <button
                        className="fd-x is-yes"
                        onClick={() => drop(s.id)}
                      >
                        ほんとうに消す
                      </button>
                      <button className="fd-x" onClick={() => setAsk(null)}>
                        やめる
                      </button>
                    </span>
                  ) : (
                    <button
                      className="fd-x"
                      aria-label={`${s.title} ${yen(s.yen)} を消す`}
                      onClick={() => setAsk(s.id)}
                    >
                      けす
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {more && (
        <button className="mp-sc-more" onClick={onMore} disabled={adding}>
          {adding ? "よみこんでいます…" : "もっと古いぶん"}
        </button>
      )}
      {addBad && <ReadAgain what="続き" quiet />}
    </>
  );
}

function GoalPart({
  now,
  done,
  thisYear,
  onBox,
  onGoals,
}: {
  now: FundGoal | null;
  done: FundGoal[];
  thisYear: number;
  onBox: (b: FundBox) => void;
  onGoals: (f: (cur: FundGoal[] | null) => FundGoal[]) => void;
}) {
  const { token } = useAuth();
  const [d, put] = useDraft("ayato-fund-goal", { from: "", label: "", yen: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [err, setErr] = useState("");
  const [closed, setClosed] = useState(0);
  const [ask, setAsk] = useState(false);

  const from = d.from || jstToday();
  const y = toYen(d.yen);
  const can = !!d.label.trim() && y > 0 && state !== "sending";

  const start = async () => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await addFundGoal({ from, label: d.label.trim(), yen: y }, t);
      if (r.box) onBox(r.box);
      onGoals((cur) => [
        r.goal,
        ...(cur ?? [])
          .filter((g) => g.id !== r.goal.id)
          .map((g) => (g.to ? g : { ...g, to: from })),
      ]);
      put({ label: "", yen: "" });
      setClosed(r.closed ?? 0);
      setState("done");
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  const drop = async () => {
    setAsk(false);
    if (!now) return;
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await dropFundGoal(now.from, t);
      if (r.box) onBox(r.box);
      onGoals((cur) => (cur ?? []).filter((g) => g.id !== now.id));
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  return (
    <>
      <Fold title="めざすものを変える" open={!now}>
        <label className="nph-post-row">
          <span>いつから</span>
          <input
            type="date"
            value={from}
            onChange={(e) => put({ from: e.target.value })}
          />
        </label>
        <label className="nph-post-row">
          <span>なまえ</span>
          <input
            type="text"
            value={d.label}
            maxLength={40}
            placeholder="北欧周りたい"
            onChange={(e) => {
              put({ label: e.target.value });
              setState("idle");
            }}
          />
        </label>
        <label className="nph-post-row">
          <span>いくら</span>
          <input
            type="text"
            inputMode="numeric"
            value={d.yen}
            maxLength={9}
            placeholder="50000"
            onChange={(e) => {
              put({ yen: e.target.value });
              setState("idle");
            }}
          />
        </label>
        {/* 押したら何が起きるか。**前のが終わることを、押す前に言う。** */}
        {now && y > 0 && (
          <p className="fd-peek">
            {now.label} {yen(now.yen)} <Icon name="right" size={12} />{" "}
            <b>
              {d.label.trim() || "（なまえ）"} {yen(y)}
            </b>
          </p>
        )}
        <button className="mp-send" disabled={!can} onClick={start}>
          {state === "sending" ? "はじめています…" : "これをめざす"}
        </button>
        {state === "done" && (
          <p className="nph-ok">
            <Icon name="check" size={13} /> 島に出ました。
            {closed > 0 && "前のは、ここで終わりにしました。"}
          </p>
        )}
        {state === "error" && (
          <p className="err">
            <Icon name="alert" size={13} /> できませんでした。{err}
          </p>
        )}
        {/* 打ち間違えた日付は、**終わらせても直らない**（いちばん新しい
            `from` を見るので、終わらせるといま走っている目標が島から消える）。
            消す道はここに残す。 */}
        {now && (
          <div className="fd-drop">
            {ask ? (
              <div className="fd-ask">
                <button className="fd-x is-yes" onClick={drop}>
                  ほんとうに消す
                </button>
                <button className="fd-x" onClick={() => setAsk(false)}>
                  やめる
                </button>
              </div>
            ) : (
              <button className="fd-x" onClick={() => setAsk(true)}>
                打ち間違えたので消す
              </button>
            )}
          </div>
        )}
      </Fold>

      {done.length > 0 && (
        <Fold title="おわった目標" lead={`${done.length} 件`}>
          <ul className="fd-rows">
            {done.map((g) => (
              <li key={g.id}>
                <span className="fd-day">{dayLabel(g.from, thisYear)}</span>
                <span className="fd-title">{g.label}</span>
                <span className="fd-yen">{yen(g.yen)}</span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </>
  );
}
