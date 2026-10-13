"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  PLAN_STATUS_NAME,
  archiveNextPlan,
  archiveSticky,
  dropStickyPic,
  getArchivedPlans,
  getArchivedStickies,
  getNextPlans,
  getStickies,
  getUnansweredStickies,
  replySticky,
  seenSticky,
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
import Wrote from "@/components/ui/Wrote";
import NotePic from "@/components/live/NotePic";


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
 *
 * ## 数は、一覧と一緒に受け取る
 *
 * `n` は**口が数えた枚数**で、`items` は新しいほうから300枚まで。
 * 300枚を超えた日に、**並んでいる枚数を数えて「いま300枚」と言わない**
 * ようにするため、数のほうを別に持つ（`docs/island-standards.md` 8章）。
 */
function useCare<T>(read1: () => Promise<{items: T[]; n: number}>) {
  const [list, setList] = useState<T[] | null>(null);
  /** 口が数えた枚数。読めるまでは null（0枚と区別する） */
  const [n, setN] = useState<number | null>(null);
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
        setList(r.items);
        setN(r.n);
        setRead("ok");
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setList(null);
    setN(null);
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

  return { list, n, read, setList, setN, reload: () => setAgain((v) => v + 1) };
}

/** 付箋の山。**4つを同時に出さない**（`docs/island-standards.md` 7章）。 */
type Box = "todo" | "seen" | "all" | "bin";

/** 山の札と、その山の1行目・空のときのことば。**並びはここ1か所。** */
const BOXES: {
  id: Box;
  label: string;
  line: (n: number) => ReactNode;
  empty: string;
}[] = [
  {
    id: "todo",
    label: "返していない",
    line: (n) => (
      <>
        まだ返していないのが <b>{n}</b> 枚
      </>
    ),
    empty: "ぜんぶ返しました。",
  },
  {
    id: "seen",
    label: "見たもの",
    line: (n) => (
      <>
        見たことにしたのが <b>{n}</b> 枚
      </>
    ),
    empty: "ここにはまだありません。",
  },
  {
    id: "all",
    label: "ぜんぶ",
    line: (n) => (
      <>
        いま <b>{n}</b> 枚
      </>
    ),
    empty: "まだ1枚もありません。",
  },
  {
    id: "bin",
    label: "しまったもの",
    line: (n) => (
      <>
        しまってあるのが <b>{n}</b> 枚
      </>
    ),
    empty: "しまったものはありません。",
  },
];

/**
 * 付箋を返す机。
 *
 * ## 「まだ返していない」を決めるのはサーバー
 *
 * **運営者が立てた付箋（`byOwner`）は数えない。** あれは返事を待つ
 * 質問ではなく、こちらから出した選択肢なので、返さなくても片づいている。
 *
 * **あやと自身が貼った付箋も、返す一覧に出さない**（あやとの言葉・2026-09-09
 * 「付箋返しのリストに私の付箋を載せるのはやめてほしい」）。自分の付箋に
 * 自分で返す用事は無いのに、返していない数に入って赤いままになっていた。
 *
 * 見分けるのは `uid`。**名前では突き合わせない**——表示名は本人が決める
 * もので、同じ名前の人が2人いた事故がこの島で実際にある。
 * ただし一覧の口（`stickyShape`）は uid も cid も返さない（返すと、同じ人の
 * 付箋を並べて数えられてしまう）。つまり**画面では決められない。**
 *
 * 2026-10-13 まで、ここは一覧と `?mine=1` の2本を引いて差し引いていた。
 * いまは**まだ返していないぶんを返す口が1本**あり（`/stickies/unanswered`）、
 * 数も一覧もそこから来る。**物差しが1本になったので、机の札の数字と、
 * ここに並ぶ枚数が食い違わない**（`docs/island-standards.md` 8章）。
 *
 * ## 「見た」は、返さずに片づける道
 *
 * 全部に返事を書くわけではない。**読んだ、で済むものがある。**
 * 「見た」を押すと返す山から下りるが、**貼った人からは何も変わらない**
 * ——印は口のどの返事にも乗らないので、掲示板でも、その人の
 * 「じぶんのもの」でも、返事を待っているときと同じ顔のまま。
 *
 * 押し間違えたら「見たもの」の山から戻す。**その山は押した順**なので、
 * いま間違えた1枚がいちばん上にいる。
 */
export function StickyCare({
  onWaiting,
}: {
  /** まだ返していない枚数を、机の札へ知らせる。読めていないあいだは null */
  onWaiting?: (n: number | null) => void;
}) {
  const { token } = useAuth();
  const [box, setBox] = useState<Box>("todo");

  /* 4つの山を、同じ器で読む。**札を切り替えるとそのまま読み直しになる**
     （`box` が変わると `read1` の顔が変わる）。 */
  const read1 = useCallback(async () => {
    if (box === "all") {
      const r = await getStickies({ limit: 300 });
      return { items: r.notes, n: r.notes.length };
    }
    const t = await withRead(token());
    if (!t) throw new Error("no-token");
    if (box === "bin") {
      const r = await getArchivedStickies(t);
      return { items: r.notes, n: r.notes.length };
    }
    const r = await getUnansweredStickies(t, { seen: box === "seen" });
    return { items: r.notes ?? [], n: r.n };
  }, [box, token]);
  const {
    list: notes,
    n,
    read,
    setList: setNotes,
    setN,
    reload,
  } = useCare(read1);

  /** まだ返していない枚数。**どの山を見ていても持ったまま**（札に出す数） */
  const [waiting, setWaiting] = useState<number | null>(null);

  /* 山を動かしたあとは、**数を口に数え直させる。**
     手元で ±1 すると、どの山で何を押したかで当たり外れが出る（「ぜんぶ」から
     返したとき、その1枚がもともと返す山に居たかは画面には分からない）。
     **数えるのは1か所**、という決めをここでも守る。返るのは数だけなので、
     一覧は引き直さない。 */
  const recount = useCallback(async () => {
    const t = await token();
    if (!t) return;
    try {
      const r = await getUnansweredStickies(t, { countOnly: true });
      setWaiting(r.n);
    } catch {
      /* 数え直せなかった日は、**前の数を消さない。** 消すと札の数字が
         消えて「ぜんぶ返した」に見える（`island-standards.md` 10章） */
    }
  }, [token]);

  /* 「返していない」の山を読めたら、その数がそのまま札の数字になる。
     ここだけは数え直しに行かない（いま読んだものが答え）。 */
  useEffect(() => {
    if (box === "todo" && read === "ok" && n !== null) setWaiting(n);
  }, [box, read, n]);

  useEffect(() => {
    onWaiting?.(waiting);
  }, [onWaiting, waiting]);

  const cur = BOXES.find((b) => b.id === box) ?? BOXES[0];
  /** **数を言ってよいのは、読めた上でのことだけ。** */
  const counted = read === "ok" && n !== null;

  return (
    <>
      {/* **4つを縦に積まない。** 1枚が4段あるものを2山ぶん同時に出すと、
          それだけで机が 3,600px になる（`island-standards.md` 7章）。 */}
      <div className="mp-care-tabs" role="tablist" aria-label="付箋の山">
        {BOXES.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={box === b.id}
            className={`mp-care-tab${box === b.id ? " is-on" : ""}`}
            onClick={() => setBox(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      {/* **読めなかった日に「読んでいます…」と言わない**（面の上と下で
          違うことを言うことになる）。数の行ごと出さず、下の札に任せる。 */}
      {read !== "down" && (
        <p className="mp-now">{counted ? cur.line(n) : "読んでいます…"}</p>
      )}
      {read === "down" ?
        /* 読みに行けなかった。**「ぜんぶ返しました。」とは別の顔にする。**
           あれは読めた上でのことばで、届かなかった日に言ってよい嘘ではない。 */
        <ReadAgain what={box === "bin" ? "しまったもの" : "付箋"} onRetry={reload} /> :
      notes === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : notes.length === 0 ? (
        <p className="muted">{cur.empty}</p>
      ) : (
        /* 返していない付箋は、返すまで減らない。**上から順に返す道具**なので、
           はじめは4枚だけ出す。1枚が「本文・札・打つ欄・押しどころ2つ」の
           4段（約 350px）あるので、8枚出すと机が 3,600px になる（実測）。
           片づけるのに、6枚目が見えている必要はない。 */
        <Longer items={notes} first={4} step={12} unit="枚" className="mp-care">
          {(x) => (
            <StickyRow
              key={x.id}
              note={x}
              pile={box}
              onChanged={(next) => {
                setNotes(
                  (list) => list?.map((y) => (y.id === x.id ? next : y)) ?? list,
                );
                recount();
              }}
              onGone={() => {
                setNotes((list) => list?.filter((y) => y.id !== x.id) ?? list);
                setN((v) => (v === null ? v : Math.max(0, v - 1)));
                recount();
              }}
            />
          )}
        </Longer>
      )}
    </>
  );
}

/** 1枚。返す・見た・しまう。**押しどころは、旅の途中でも押せる大きさにする。** */
function StickyRow({
  note,
  pile,
  onChanged,
  onGone,
}: {
  note: Sticky;
  /** いまどの山を見ているか。**出す押しどころがここで決まる** */
  pile: Box;
  onChanged: (n: Sticky) => void;
  /** この山から下りた（返した・見た・しまった・戻した） */
  onGone: () => void;
}) {
  const { token } = useAuth();
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const th = themeById(note.theme);
  const stowed = pile === "bin";

  const reply = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await replySticky(note.id, text.trim(), t);
      /* 返した1枚は、返す山から下りる。**取り消し（空で送る）は下りない**
         ——返していない状態に戻ったので、まだこの山の住人。 */
      if (r.reply && pile === "todo") return onGone();
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

  /** 「見た」・「見ていない」。**1タップで山を移る。** */
  const see = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await seenSticky(note.id, pile === "todo", t);
      onGone();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  /** 絵だけを外す。**1タップ。** 付箋の字は残る（`DELETE /stickies/:id/pic`） */
  const dropPic = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await dropStickyPic(note.id, t);
      onChanged({...note, pic: undefined});
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
      await archiveSticky(note.id, !stowed, t);
      onGone();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      {/* **書いてくれたまま出す**（#83）。返すときに、貼った人の改行が見えていないと
          何に答えているのか分からなくなる */}
      <Wrote t={note.text} as="p" className="mp-care-text" />
      {/* 貼られた絵（2026-10-08）。**ここに出さないと、荒れた絵を見つける
          場所が板しかなくなる。** 返す机は、あやとが上から順に片づける
          ところなので、外す押しどころも下に並べてある */}
      {note.pic && <NotePic pic={note.pic} />}
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
        {/* 返さずに片づける（`pile === "todo"`）／押し間違えを戻す
            （`"seen"`）。**「ぜんぶ」と「しまったもの」には出さない**
            ——あちらは公開の口から読むので、その1枚が「見た」かどうかを
            画面は知らない。**知らない状態の押しどころを置かない。** */}
        {(pile === "todo" || pile === "seen") && (
          <button
            className="mp-send is-small is-quiet"
            disabled={busy}
            onClick={see}
          >
            {pile === "todo" ? "見た" : "もどす"}
          </button>
        )}
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {stowed ? "もどす" : "しまう"}
        </button>
        {/* 絵が貼ってある1枚にだけ出る。**付箋ごと下ろさずに、絵だけ外す** */}
        {note.pic && (
          <button className="mp-send is-small is-quiet" disabled={busy} onClick={dropPic}>
            絵をはずす
          </button>
        )}
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
    /* **数は、並べるものを数えて出す。** 企画の口は数を別に返さないので、
       ここは一覧の長さがそのまま答え（付箋の「返していない」だけは、
       画面では決められないので口が数える）。 */
    const list = !bin ?
      (await getNextPlans(200)).plans :
      await (async () => {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        return (await getArchivedPlans(t)).plans;
      })();
    return { items: list, n: list.length };
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
      {/* 欄は板（`.dform`）の上に置く。**`.nph-post-row` は `.dform` の中でしか
          成り立たない。** 添えの字を欄の上に積むのも（`.dform label`）、欄を
          彫るのも（`.dform input/select`）あちらが持っているので、板の外に
          置くと、ブラウザ既定の白い箱とシステムの字が、すぐ上の付箋の返事
          （`.bin`）の隣に並ぶ。投げ銭の紐付け（`.dform mp-donor-form`）が
          同じ形の道具なので、作業台もそちらにそろえる。 */}
      <div className="dform mp-care-form">
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
      </div>
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
