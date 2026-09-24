"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addFundChat,
  addFundGoal,
  addFundSpend,
  closeFundGoal,
  dropFundGoal,
  dropFundSpend,
  getFundDesk,
  getFundSpends,
  type FundBox,
  type FundGoal,
  type FundSpend,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import FundHistory from "./FundHistory";
import ReadAgain, { sayable } from "./ReadAgain";

/**
 * 豚の貯金箱の机。**あやとだけ。**
 *
 * ## なぜ作ったか
 *
 * 2026-09-24 の時点で、**出費と目標はどの画面からも見られなかったし、
 * どの画面からも入れられなかった。** 入れる道は GitHub Actions
 * （`python/admin/fund_add.py`）1本で、旅先のスマホからは触れない。
 * ここに並んでいたのはスパチャの控えだけで、それも読むだけだった。
 *
 * ## 出費がいちばん上に来る理由（#639）
 *
 * あやとの決め（2026-09-24）「財布は1つ。目標はラベルでしかなく、
 * **『0から貯め直す』は前の目標のぶんを支出として書くことで起きる**」。
 * つまり出費の一覧が「もらったお金の行き先」の台帳そのもので、
 * 目標を切り替えるのもここに1行足す動きになる。**開いて最初に出るのは出費。**
 *
 * ## 3つを縦に積まない
 *
 * 出費・目標・スパチャは、どれも**増える**（`docs/island-standards.md` 7）。
 * 増えるものが2つ以上ある面は、畳むだけでは足りない——畳んだものが縦に並ぶ。
 * 札で切り替えて、**同時に1つしか出さない。**
 *
 * ## 押す前に、いくらになるかを出す
 *
 * 額が動く口なので、打っているあいだ「いま◯円 → ◯円」を出す。
 * 出せるのは**焼き直しと Doneru の両方が読めているとき**だけで、
 * 片方でも欠けていたら1行も出さない（読めていないことを、値0と同じ絵に
 * しない。`docs/island-standards.md` 10）。
 *
 * ## 消すのは2段
 *
 * 1回押すと「ほんとうに消す／やめる」に変わる。額が動くものを、
 * 走っている車の中の1タップで消させない。
 */

/** 何を開いているか。**出費がいちばん上**（#639）。 */
type Pane = "spend" | "goal" | "chat";

const PANES: { id: Pane; label: string }[] = [
  { id: "spend", label: "出費" },
  { id: "goal", label: "目標" },
  { id: "chat", label: "スパチャ" },
];

/** 前に開いていた札。次に開いたとき、そこから続けられるように控える。 */
const LAST = "ayato-fund-pane";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

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

/** `2026-09-12` → `2026年9月`。月ごとにまとめる見出し。 */
function monthLabel(day: string): string {
  if (!/^\d{4}-\d{2}/.test(day)) return "日づけのないぶん";
  return `${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月`;
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

export default function FundDesk() {
  const { token } = useAuth();
  const online = useOnline();
  const [pane, setPane] = useState<Pane>("spend");
  /** 読み終えたもの。取りにいっている最中は null（0件と区別する） */
  const [box, setBox] = useState<FundBox | null>(null);
  const [doneru, setDoneru] = useState<number | null>(null);
  const [spends, setSpends] = useState<FundSpend[] | null>(null);
  const [goals, setGoals] = useState<FundGoal[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addBad, setAddBad] = useState(false);
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);
  /** スパチャの控えを読み直させる合図 */
  const [chatAgain, setChatAgain] = useState(0);
  const cursor = useRef<string | null>(null);
  const thisYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST);
      if (v && PANES.some((p) => p.id === v)) setPane(v as Pane);
    } catch {
      /* 控えられない端末では、出費から始まるだけ */
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

  /* 落ちたら、押されるまで待たずに読み直す（`island-misses.md` 決めごと9）。
     旅先は電波が細いのがふつうの状態。`catch` で空にすると、届かなかった
     日に「まだ1件も入っていません」と言い切ることになる。 */
  useEffect(() => {
    let gone = false;
    let got = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(getFundDesk(t));
        if (gone) return;
        got = true;
        miss = 0;
        setBox(r.box);
        setDoneru(r.doneru);
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

    /* 電波が戻った合図。**画面を開き直させないため。** */
    const wake = () => {
      if (got || gone) return;
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
      /* 押した人は、まとめて欲しがっている（隣の「スパチャ」の `STEP` と同じ）。 */
      const r = await withRead(getFundSpends(t, cursor.current, 40));
      /* **足したばかりの行と重ならないように畳む。** 古い日付で1行足すと、
         その行は手元の一覧に載ったまま続きにも入ってくる（続きの位置は
         開いたときのもの）。同じ id が2つ並ぶと React が鍵で怒る。 */
      setSpends((cur) => sortIn([...(cur ?? []), ...r.spends]));
      setMore(r.more);
      cursor.current = r.next;
    } catch {
      setAddBad(true);
    } finally {
      setAdding(false);
    }
  }, [adding, token]);

  /** いま貯金箱にいくら入っているか。**島の豚と同じ式。** */
  const total =
    box && doneru !== null ? box.start + box.superchat + doneru : null;

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
        {box && (
          <p className="fd-side">
            もらった <b>{yen(box.superchat + (doneru ?? 0))}</b>
            <span>／</span>
            つかった <b>{yen(box.spend)}</b>
          </p>
        )}
        {/* **目標の札を開いているときは出さない。** すぐ下の1枚が同じことを
            言う（`docs/island-standards.md` 6章「重複した説明は消す」）。 */}
        {now && pane !== "goal" && (
          <p className="fd-goalnow">
            めざす <b>{yen(now.yen)}</b> {now.label}
          </p>
        )}
      </div>

      <div className="fd-tabs" role="tablist" aria-label="貯金箱の中身">
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

      {pane === "spend" && (
        <SpendPane
          total={total}
          spends={spends}
          more={more}
          adding={adding}
          addBad={addBad}
          thisYear={thisYear}
          onMore={addMore}
          onBox={setBox}
          onAdd={(s) => setSpends((cur) => sortIn([...(cur ?? []), s]))}
          onDrop={(id) =>
            setSpends((cur) => (cur ?? []).filter((x) => x.id !== id))
          }
        />
      )}

      {pane === "goal" && (
        <GoalPane
          now={now}
          done={done}
          thisYear={thisYear}
          onBox={setBox}
          onGoals={setGoals}
        />
      )}

      {pane === "chat" && (
        <ChatPane
          total={total}
          full={box?.superchatFull ?? null}
          onBox={setBox}
          onChanged={() => setChatAgain((n) => n + 1)}
          again={chatAgain}
        />
      )}
    </div>
  );
}

/** 足した1行を、新しい順のところへ入れ直す。 */
function sortIn(rows: FundSpend[]): FundSpend[] {
  const seen = new Map(rows.map((r) => [r.id, r]));
  return [...seen.values()].sort((a, b) =>
    a.day === b.day ? b.id.localeCompare(a.id) : b.day.localeCompare(a.day),
  );
}

/* ---------------------------------------------------------------- 出費 */

function SpendPane({
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
  const [d, put] = useDraft("ayato-fund-spend", {
    day: "",
    title: "",
    yen: "",
  });
  const [state, setState] = useState<"idle" | "sending" | "done" | "same" | "error">(
    "idle",
  );
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
                      <button className="fd-x is-yes" onClick={() => drop(s.id)}>
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

/* ---------------------------------------------------------------- 目標 */

function GoalPane({
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
  const [d, put] = useDraft("ayato-fund-goal", {
    from: "",
    label: "",
    yen: "",
  });
  const [to, setTo] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "same" | "error">(
    "idle",
  );
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<"close" | "drop" | null>(null);

  const from = d.from || jstToday();
  const y = toYen(d.yen);
  const can = !!d.label.trim() && y > 0 && state !== "sending";

  const run = async (go: (t: string) => Promise<FundBox | null>) => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const b = await go(t);
      if (b) onBox(b);
      setAsk(null);
      setState("done");
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  return (
    <>
      {now ? (
        <div className="fd-card">
          <p className="fd-cardh">
            <b>{now.label}</b>
            <i>{yen(now.yen)}</i>
          </p>
          <p className="fd-cardn">
            {dayLabel(now.from, thisYear)} から
          </p>
          {ask === "close" ? (
            <div className="fd-close">
              <label className="nph-post-row">
                <span>おわった日</span>
                <input
                  type="date"
                  value={to || jstToday()}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <div className="fd-ask">
                <button
                  className="fd-x is-yes"
                  onClick={() =>
                    run(async (t) => {
                      const r = await closeFundGoal(now.from, to || jstToday(), t);
                      onGoals((cur) =>
                        (cur ?? []).map((g) => (g.id === r.goal.id ? r.goal : g)),
                      );
                      return r.box;
                    })
                  }
                >
                  おわりにする
                </button>
                <button className="fd-x" onClick={() => setAsk(null)}>
                  やめる
                </button>
              </div>
            </div>
          ) : ask === "drop" ? (
            <div className="fd-ask">
              <button
                className="fd-x is-yes"
                onClick={() =>
                  run(async (t) => {
                    const r = await dropFundGoal(now.from, t);
                    onGoals((cur) => (cur ?? []).filter((g) => g.id !== now.id));
                    return r.box;
                  })
                }
              >
                ほんとうに消す
              </button>
              <button className="fd-x" onClick={() => setAsk(null)}>
                やめる
              </button>
            </div>
          ) : (
            <div className="fd-ask">
              <button className="fd-x is-yes" onClick={() => setAsk("close")}>
                おわりにする
              </button>
              <button className="fd-x" onClick={() => setAsk("drop")}>
                けす
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="blank">
          <b>いま、めざしているものは無い</b>
          <p>つぎに貯めたいものを、下から1つ。</p>
        </div>
      )}

      <Fold title="あたらしくはじめる" open={!now}>
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
        {/* いま走っている目標があるときは、押すとどちらが出るかを先に言う */}
        {now && y > 0 && (
          <p className="fd-peek">
            めざす {yen(now.yen)} <Icon name="right" size={12} />{" "}
            <b>{yen(y)}</b>
          </p>
        )}
        <button
          className="mp-send"
          disabled={!can}
          onClick={() =>
            run(async (t) => {
              const r = await addFundGoal(
                { from, label: d.label.trim(), yen: y },
                t,
              );
              onGoals((cur) => [
                r.goal,
                ...(cur ?? []).filter((g) => g.id !== r.goal.id),
              ]);
              put({ label: "", yen: "" });
              return r.box;
            })
          }
        >
          {state === "sending" ? "はじめています…" : "これをめざす"}
        </button>
      </Fold>

      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 島に出ました。
        </p>
      )}
      {state === "error" && (
        <p className="err">
          <Icon name="alert" size={13} /> できませんでした。{err}
        </p>
      )}

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

/* ---------------------------------------------------------------- スパチャ */

function ChatPane({
  total,
  full,
  onBox,
  onChanged,
  again,
}: {
  total: number | null;
  /** 半分にする前のスパチャの合計。**1円の丸めを合わせるのに要る** */
  full: number | null;
  onBox: (b: FundBox) => void;
  onChanged: () => void;
  again: number;
}) {
  const { token } = useAuth();
  const [d, put] = useDraft("ayato-fund-chat", { day: "", yen: "", who: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "same" | "error">(
    "idle",
  );
  const [err, setErr] = useState("");

  const day = d.day || jstToday();
  const y = toYen(d.yen);
  const can = y > 0 && state !== "sending";

  const send = async () => {
    setState("sending");
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await addFundChat(
        { day, yen: y, who: d.who.trim() },
        t,
      );
      if (r.box) onBox(r.box);
      put({ yen: "", who: "" });
      setState(r.already ? "same" : "done");
      onChanged();
    } catch (e) {
      setErr(sayable(e));
      setState("error");
    }
  };

  return (
    <>
      <Fold title="来ていないぶんを足す">
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
        {/* 押した先の額をそのまま出す。**`floor(y/2)` を足さない**——
            貯金箱は「ぜんぶ足してから半分」なので、いまの合計が奇数だと
            1円ずれる（`python/fund_box.py` の頭）。合計から出し直す。 */}
        {total !== null && full !== null && y > 0 && (
          <p className="fd-peek">
            {yen(total)} <Icon name="right" size={12} />{" "}
            <b>
              {yen(
                total + Math.floor((full + y) / 2) - Math.floor(full / 2),
              )}
            </b>
          </p>
        )}
        <button className="mp-send" disabled={!can} onClick={send}>
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
      </Fold>

      <FundHistory
        again={again}
        onDropped={(b) => {
          if (b) onBox(b);
          onChanged();
        }}
      />
    </>
  );
}
