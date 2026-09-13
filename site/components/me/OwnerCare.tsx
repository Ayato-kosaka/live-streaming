"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_STATUS_NAME,
  archiveNextPlan,
  archiveSticky,
  getArchivedPlans,
  getArchivedStickies,
  getMyStickies,
  getNextPlans,
  getStickies,
  replySticky,
  setPlanStatus,
  type NextPlan,
  type PlanStatus,
  type Sticky,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { themeById } from "@/content/themes";
import ReadAgain from "./ReadAgain";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import { jstDay } from "@/lib/nightly";


/**
 * 机の道具が読む一覧を、1本だけ引く。**付箋と企画で同じものを使う。**
 *
 * ## なぜ `catch` で空にしないか（#34 #36 #43）
 *
 * ここは長いあいだ `catch { setNotes([]) }` / `catch { setPlans([]) }` だった。
 * **空の配列は「読めた上での0件」のことば**なので、電波が細い日の机が
 *
 *   - 「まだ返していないのが **0** 枚」「ぜんぶ返しました。」
 *   - 「いま **0** 件」「まだ1件もありません。」
 *
 * と言い切っていた。ここは**あやとが旅先で開く面**で、これを見たら
 * 「返信は済んでいる」と思ってそのまま閉じる。17日間そう思ったままになる。
 *
 * 答えは3つ持つ（`lib/auth.tsx` の `Read`）。返事が来ないのも「読めなかった」
 * （`withRead` が12秒で見切る）。落ちたら黙って読み直し（間隔を倍にしながら
 * 30秒まで）、`online`・画面に戻ってきたでも読み直す。**画面を開き直させない。**
 * 骨に戻すのは押されたときだけ（ひとりでに戻すと、灰色と文言が入れ替わる）。
 */
function useCare<T>(read1: () => Promise<T[]>) {
  const [list, setList] = useState<T[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const r = await withRead(read1());
        if (gone) return;
        ok = true;
        miss = 0;
        setList(r);
        setRead("ok");
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setList(null);
    setRead("wait");
    go();

    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。
       読めているうちは何もしない（画面に戻るたびに往復を1本増やさない）。 */
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
  }, [read1, again]);

  return { list, read, setList, reload: () => setAgain((n) => n + 1) };
}

/**
 * まだ返していない付箋。
 *
 * **運営者が立てた付箋（`byOwner`）は数えない。** あれは返事を待つ
 * 質問ではなく、こちらから出した選択肢なので、返さなくても片づいている。
 *
 * **あやと自身が貼った付箋も、返す一覧に出さない**（あやとの言葉・2026-09-09
 * 「付箋返しのリストに私の付箋を載せるのはやめてほしい」）。自分の付箋に
 * 自分で返す用事は無いのに、返していない数に入って赤いままになっていた。
 *
 * ## 見分けかた
 *
 * **名前では突き合わせない。** 表示名は本人が決めるもので、同じ名前の人が
 * 2人いた事故がこの島で実際にある。`uid` で見分ける。
 *
 * ただし一覧の口（`stickyShape`）は uid も cid も返さない。返すと、
 * 同じ人の付箋を並べて数えられてしまうので、そこは開けない決めになっている。
 * かわりに**自分のぶんだけを返す口**（`/stickies?mine=1`。サーバー側で
 * uid で絞る）をもう1回引いて、その id を一覧から差し引く。
 * 公開する形は増えないし、名前を突き合わせずに済む。
 *
 * `byOwner` と同じ扱いにする。**消さずに、返す対象から外すだけ**なので、
 * 「ぜんぶ見る」と「しまったもの」には今までどおり出る。自分の付箋を
 * しまう道は残しておく。
 */
export function StickyCare() {
  const { token } = useAuth();
  /** あやと自身が貼った付箋の id。引けるまでは null（0枚と区別する） */
  const [own, setOwn] = useState<Set<string> | null>(null);
  /** しまったものを見ているか */
  const [bin, setBin] = useState(false);
  const [all, setAll] = useState(false);

  /* 貼ってあるぶんと、しまったぶん。**同じ器で読む**ので、札を切り替えると
     そのまま読み直しになる（`bin` が変わると `read1` の顔が変わる）。 */
  const read1 = useCallback(async () => {
    if (!bin) return (await getStickies({ limit: 300 })).notes;
    const t = await withRead(token());
    if (!t) throw new Error("no-token");
    return (await getArchivedStickies(t)).notes;
  }, [bin, token]);
  const { list: notes, read, setList: setNotes, reload } = useCare(read1);

  useEffect(() => {
    let gone = false;
    (async () => {
      /* **`withRead` を通す。** ここが返ってこないと `own` が null のままで、
         付箋のほうが読めていても灰色が残り続ける（下の `reading`）。 */
      const t = await withRead(token()).catch(() => null);
      if (gone) return;
      if (!t) return setOwn(new Set());
      try {
        const r = await withRead(getMyStickies(t));
        if (!gone) setOwn(new Set(r.notes.map((n) => n.id)));
      } catch {
        /* 引けなかった日は、差し引かずに出す。**返す道が消えるより、
           自分のぶんが混ざるほうがまし。** 数は多いほうへ寄るので、
           「ぜんぶ返しました」と言ってしまうことはない。 */
        if (!gone) setOwn(new Set());
      }
    })();
    return () => {
      gone = true;
    };
  }, [token]);

  /** 返す相手のいる付箋か。**数と一覧で同じ物差しを使う**（片方だけ減らさない） */
  const todo = (n: Sticky) => !n.reply && !n.byOwner && !own?.has(n.id);
  const shown = (notes ?? []).filter((n) => bin || all || todo(n));
  const waiting = (notes ?? []).filter(todo).length;
  /* 自分のぶんを引く前に数を出すと、開いた直後だけ多い数が見えて、
     すぐ減る。**動く数字を出すくらいなら、出るのを待つ。** */
  const reading = read === "wait" || own === null;
  /** **数を言ってよいのは、読めた上でのことだけ。** */
  const counted = read === "ok" && own !== null;

  return (
    <>
      {/* **読めなかった日に「読んでいます…」と言わない**（面の上と下で
          違うことを言うことになる）。数の行ごと出さず、下の札に任せる。 */}
      {read !== "down" && (
        <p className="mp-now">
          {counted ?
            <>まだ返していないのが <b>{waiting}</b> 枚</> :
            "読んでいます…"}
        </p>
      )}
      {read === "down" ?
        /* 読みに行けなかった。**「ぜんぶ返しました。」とは別の顔にする。**
           あれは読めた上でのことばで、届かなかった日に言ってよい嘘ではない。 */
        <ReadAgain what={bin ? "しまったもの" : "付箋"} onRetry={reload} /> :
      reading ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">
          {bin ? "しまったものはありません。" : "ぜんぶ返しました。"}
        </p>
      ) : (
        /* 返していない付箋は、返すまで減らない。**上から順に返す道具**なので、
           はじめは4枚だけ出す。1枚が「本文・札・打つ欄・押しどころ2つ」の
           4段（約 350px）あるので、8枚出すと机が 3,600px になる（実測）。
           片づけるのに、6枚目が見えている必要はない。 */
        <Longer items={shown} first={4} step={12} unit="枚" className="mp-care">
          {(n) => (
            <StickyRow
              key={n.id}
              note={n}
              stowed={bin}
              onChanged={(next) =>
                setNotes(
                  (cur) => cur?.map((x) => (x.id === n.id ? next : x)) ?? cur,
                )
              }
              onStowed={() =>
                setNotes((cur) => cur?.filter((x) => x.id !== n.id) ?? cur)
              }
            />
          )}
        </Longer>
      )}
      <div className="mp-care-acts">
        {/* 札を切り替えるだけ。読み直しは `useCare` が受け持つ（`bin` が
            変わると、そのまま次の一覧を取りに行く）。 */}
        <button
          className="nt-obtn"
          onClick={() => {
            setBin(false);
            setAll((v) => !v);
          }}
        >
          {all && !bin ? "返していないものだけ" : "ぜんぶ見る"}
        </button>
        <button
          className="nt-obtn"
          onClick={() => {
            setBin((v) => !v);
            setAll(false);
          }}
        >
          {bin ? "貼ってあるものに戻る" : "しまったものを見る"}
        </button>
      </div>
    </>
  );
}

/** 1枚。返す・しまう。**押しどころは、旅の途中でも押せる大きさにする。** */
function StickyRow({
  note,
  stowed,
  onChanged,
  onStowed,
}: {
  note: Sticky;
  stowed: boolean;
  onChanged: (n: Sticky) => void;
  onStowed: () => void;
}) {
  const { token } = useAuth();
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const th = themeById(note.theme);

  const reply = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await replySticky(note.id, text.trim(), t);
      onChanged({
        ...note,
        reply: r.reply ?? undefined,
        repliedAt: r.repliedAt ?? undefined,
      });
    } catch {
      // 書けなかったら、打った字はそのまま残す
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const stow = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await archiveSticky(note.id, !stowed, t);
      onStowed();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <p className="mp-care-text">{note.text}</p>
      {/* テーマ・日付・貼った人。**札にしない**（`.mp-note-foot`）。
          札は1つ 28px と左右の余白を持つので、3つ並ぶと1件が1行ぶん高くなる。
          区切りは入れ物が中黒で入れるので、ここでは字だけを並べる。 */}
      <p className="mp-note-foot">
        <span>{th?.name ?? note.theme}</span>
        {/* 貼った時刻は UTC で入っている。**日本時間で切る**（`jstDay`）。
            字をそのまま切ると、日本の朝9時より前に貼った付箋が前日に出る */}
        {jstDay(note.createdAt) && <span>{jstDay(note.createdAt)}</span>}
        {note.by && <span>{note.by}</span>}
      </p>
      <textarea
        className="bin"
        value={text}
        rows={2}
        maxLength={300}
        placeholder="ここに返す。空にすると取り消し"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={reply}>
          {busy ? "送っています…" : note.reply ? "返しなおす" : "返す"}
        </button>
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {stowed ? "もどす" : "しまう"}
        </button>
      </div>
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> いま送れませんでした。もう一度押してください。
        </p>
      )}
    </li>
  );
}

/**
 * 企画の段を動かす。
 *
 * 提案 → これから → やった。「これから」に上げるときは、Git 側の企画の id を
 * 結び付ける。**結び付けないと、板に出た提案と、実際に立っているページが、
 * 画面の上で他人のまま**になる（掲示板の道具と同じ決まり）。
 */
export function PlanCare() {
  const { token } = useAuth();
  const [bin, setBin] = useState(false);

  /* 出ているぶんと、しまったぶん。**同じ器で読む**ので、札を切り替えると
     そのまま読み直しになる（`StickyCare` と同じ）。 */
  const read1 = useCallback(async () => {
    if (!bin) return (await getNextPlans(200)).plans;
    const t = await withRead(token());
    if (!t) throw new Error("no-token");
    return (await getArchivedPlans(t)).plans;
  }, [bin, token]);
  const { list: plans, read, setList: setPlans, reload } = useCare(read1);

  return (
    <>
      {/* **数を言ってよいのは、読めたときだけ。** 読めなかった日は
          「読んでいます…」とも言わない（下の札と食い違う）。 */}
      {read !== "down" && (
        <p className="mp-now">
          {read === "ok" && plans ? <>いま <b>{plans.length}</b> 件</> : "読んでいます…"}
        </p>
      )}
      {read === "down" ?
        /* 読みに行けなかった。**「まだ1件もありません。」とは別の顔にする。** */
        <ReadAgain what={bin ? "しまったもの" : "企画"} onRetry={reload} /> :
      plans === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : plans.length === 0 ? (
        <p className="muted">{bin ? "しまったものはありません。" : "まだ1件もありません。"}</p>
      ) : (
        /* 1件が「題・札・段の欄・id の欄・押しどころ2つ」の6段ある。
           付箋と同じ理由で4件（`StickyCare`）。 */
        <Longer items={plans} first={4} step={12} unit="件" className="mp-care">
          {(p) => (
            <PlanRow
              key={p.id}
              plan={p}
              stowed={bin}
              onChanged={(next) =>
                setPlans((cur) => cur?.map((x) => (x.id === p.id ? next : x)) ?? cur)
              }
              onStowed={() => setPlans((cur) => cur?.filter((x) => x.id !== p.id) ?? cur)}
            />
          )}
        </Longer>
      )}
      <div className="mp-care-acts">
        {/* 札を切り替えるだけ。読み直しは `useCare` が受け持つ */}
        <button className="nt-obtn" onClick={() => setBin((v) => !v)}>
          {bin ? "出ているものに戻る" : "しまったものを見る"}
        </button>
      </div>
    </>
  );
}

function PlanRow({
  plan,
  stowed,
  onChanged,
  onStowed,
}: {
  plan: NextPlan;
  stowed: boolean;
  onChanged: (p: NextPlan) => void;
  onStowed: () => void;
}) {
  const { token } = useAuth();
  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [planId, setPlanId] = useState(plan.planId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const move = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await setPlanStatus(plan.id, status, planId.trim(), t);
      onChanged(r.plan);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const stow = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await archiveNextPlan(plan.id, !stowed, t);
      onStowed();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <p className="mp-care-text">{plan.title || "（題なし）"}</p>
      {/* 段・出した人・さんせい。付箋の足元と同じ作り（札にしない）。 */}
      <p className="mp-note-foot">
        <span>いま {PLAN_STATUS_NAME[plan.status]}</span>
        {plan.by && <span>{plan.by}</span>}
        {plan.hearts > 0 && <span>さんせい {plan.hearts}</span>}
      </p>
      <label className="nph-post-row">
        <span>どの段へ</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
          {(Object.keys(PLAN_STATUS_NAME) as PlanStatus[]).map((s) => (
            <option key={s} value={s}>
              {PLAN_STATUS_NAME[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="nph-post-row">
        <span>ページの id</span>
        <input
          type="text"
          value={planId}
          maxLength={40}
          placeholder="nordic / iran-walk。空で外す"
          onChange={(e) => setPlanId(e.target.value)}
        />
      </label>
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={move}>
          {busy ? "動かしています…" : "動かす"}
        </button>
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {stowed ? "もどす" : "しまう"}
        </button>
      </div>
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> いま動かせませんでした。もう一度押してください。
        </p>
      )}
    </li>
  );
}
