"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_STATUS_NAME,
  archiveNextPlan,
  archiveSticky,
  dropStickyPic,
  getArchivedPlans,
  getArchivedStickies,
  getNextPlans,
  getSeenStickies,
  getStickies,
  getWaitingStickies,
  replySticky,
  seenSticky,
  setPlanStatus,
  type NextPlan,
  type PlanStatus,
  type Sticky,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { destById, useDests } from "@/lib/dests";
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

/** 机に並べる棚。**1つだけ開く。** */
type View = "todo" | "all" | "seen" | "bin";

/** 棚の札。並びはここ1か所（画面に書き並べない） */
const VIEWS: { id: View; label: string }[] = [
  { id: "todo", label: "まだ" },
  { id: "all", label: "ぜんぶ" },
  { id: "seen", label: "既読" },
  { id: "bin", label: "しまった" },
];

/**
 * まだ何もしていない付箋の、数と id。**引けるまでは null**（0枚と区別する）。
 *
 * **`state` を持たせたのは 2026-10-13。** それまで「まだ取れていない」と
 * 「取れなかった」を同じ `null` で表していて、**一度失敗すると「まだ」の棚が
 * 永久に「読んでいます…」のまま**だった（あやとが本番で踏んだ。
 * 画面を先に配って口を後に配ったので、そのあいだに机を開くと 404 を受ける）。
 * 読み直しの手も無かったので、画面を送り直すしか戻る道が無かった。
 */
export type Waiting = {
  /** 枚数。読めていなければ null */
  n: number | null;
  /** その id。読めていなければ null */
  ids: Set<string> | null;
  /** いまどこに居るか。**`null` を2通りに読ませない** */
  state: "reading" | "ok" | "down";
  /** 数え直す */
  reload: () => void;
};

/**
 * **まだこちらが何もしていない付箋**を、口に数えてもらう。
 *
 * ## なぜ画面で数えないか
 *
 * ここは長いあいだ、画面の側で数えていた——一覧を引いて、自分のぶん
 * （`?mine=1`）をもう1本引いて、`!n.reply && !n.byOwner && !own.has(n.id)`
 * で絞る。**同じ条件が画面とサーバーの両方に要る形**で、既読を足すと
 * 3か所目が増える。
 *
 * いまは口が1本で数と id の両方を返す（`GET /stickies/waiting`）。
 * **札の数も、机の絞り込みも、同じ1本から出る。** 物差しが1つなら、
 * 片方だけ古くなりようがない（`docs/island-standards.md` 8章）。
 *
 * 机（`Desk.tsx`）は札のバッジに `n` だけを使う。**道具を開かずに引ける**
 * のは、この口が本文も名前も返さないから。
 */
export function useWaiting(): Waiting {
  const { token, owner } = useAuth();
  const [got, setGot] = useState<{ n: number; ids: Set<string> } | null>(null);
  const [down, setDown] = useState(false);
  const [again, setAgain] = useState(0);

  /* **繋がり直したら、ひとりでに数え直す。** 隣の `useCare` が同じ形を
     持っている（17日ぶん黙ったことがあって足したもの）。読み直しの手を
     画面に出しても、押す人が机を開いたままとは限らない。 */
  useEffect(() => {
    if (owner !== "yes") return;
    const wake = () => {
      if (document.visibilityState === "visible") setAgain((x) => x + 1);
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [owner]);

  useEffect(() => {
    /* あやとでないあいだは叩かない。403 が返るだけの往復になる */
    if (owner !== "yes") return;
    let gone = false;
    setDown(false);
    (async () => {
      const t = await withRead(token()).catch(() => null);
      if (gone) return;
      if (!t) {
        setDown(true);
        return;
      }
      try {
        const r = await withRead(getWaitingStickies(t));
        /* **形が違う返事を、数として読まない。** `{}` が返ると
           `r.waiting` は undefined で、そのまま入れると札が空のバッジを
           出し、机の1行目が「まだ返していないのが  枚」になる。
           読めなかったのと同じ顔にする（§15） */
        if (typeof r.waiting !== "number" || !Array.isArray(r.ids)) {
          throw new Error("bad shape");
        }
        if (!gone) setGot({ n: r.waiting, ids: new Set(r.ids) });
      } catch {
        /* **0 を答えとして出さない**（`docs/island-standards.md` §15）。
           読めなかった日に札へ 0 を出すと、「ぜんぶ返した」に見える。
           数は null のままにして、**落ちたことは `down` で別に言う**——
           同じ null で「まだ」と「駄目だった」を表すと、棚が永久に回る */
        if (!gone) setDown(true);
      }
    })();
    return () => {
      gone = true;
    };
  }, [token, owner, again]);

  return {
    n: got?.n ?? null,
    ids: got?.ids ?? null,
    state: got ? "ok" : down ? "down" : "reading",
    reload: () => setAgain((x) => x + 1),
  };
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
 * **既読にしたものも、ここから外れる**（2026-10-13）。あやとの言葉:
 *
 * > 既読機能みたいな、返信しないで未返信から減らす機能も欲しい
 *
 * 返す言葉の要らない1枚（「見てます」「ありがとう」）に返信を書かないかぎり、
 * その1枚は永久に数に残っていた。**数が減らないと、数そのものが読まれなくなる。**
 *
 * ## 見分けかたは、口が持っている
 *
 * 名前では突き合わせない（表示名は本人が決めるもので、同じ名前の人が2人いた
 * 事故がこの島で実際にある）。`uid` で見分けるが、一覧の口（`stickyShape`）は
 * uid も cid も返さない——返すと、同じ人の付箋を並べて数えられてしまう。
 *
 * だから**絞り込みごと口に任せた**（`useWaiting`）。公開する形は1つも増えず、
 * 札の数と机の中身が同じ1本から出る。
 *
 * ## 棚は4つ。**1つだけ開く**
 *
 * まだ／ぜんぶ／既読／しまった。既読としまったを**別の棚にする**のは、
 * 既読が「読んだが返さない」で、しまったが「板から下ろした」だから。
 * 同じ棚に混ぜると、戻すときにどちらを戻すのか分からない。
 */
export function StickyCare({ waiting }: { waiting: Waiting }) {
  const { token } = useAuth();
  const [view, setView] = useState<View>("todo");

  /* 棚ごとに引く先が違う。**同じ器で読む**ので、札を切り替えると
     そのまま読み直しになる（`view` が変わると `read1` の顔が変わる）。 */
  const read1 = useCallback(async () => {
    if (view === "todo" || view === "all") {
      return (await getStickies({ limit: 300 })).notes;
    }
    const t = await withRead(token());
    if (!t) throw new Error("no-token");
    return view === "seen" ?
        (await getSeenStickies(t)).notes :
        (await getArchivedStickies(t)).notes;
  }, [view, token]);
  const { list: notes, read, setList: setNotes, reload } = useCare(read1);

  /* **「まだ」の棚だけ、口が選んだ id で絞る。** 画面でもう一度条件を
     書くと、口と画面で物差しが2つになる（この関数の注）。 */
  const shown =
    view === "todo" ?
      (notes ?? []).filter((n) => waiting.ids?.has(n.id)) :
      (notes ?? []);
  /* 札の数が出る前に一覧を出すと、開いた直後だけ全部が見えて、すぐ減る。
     **動く数字を出すくらいなら、出るのを待つ。** */
  /* **「まだ取れていない」だけを待つ。** 取れなかった日まで待つと、棚が
     永久に回る（2026-10-13 に本番で踏んだ）。落ちた日は下の読み直しに渡す。 */
  const reading = read === "wait" || (view === "todo" && waiting.state === "reading");
  /** 「まだ」の棚だけ、数が引けないと中身を絞れない。**黙らずに読み直しを出す** */
  const waitDown = view === "todo" && waiting.state === "down";
  /** **数を言ってよいのは、読めた上でのことだけ。** */
  const counted = read === "ok" && waiting.n !== null;

  /** 1枚ぶんの印を変えたら、札の数も数え直す。**別々に動かさない。** */
  const drop = (id: string) => {
    setNotes((cur) => cur?.filter((x) => x.id !== id) ?? cur);
    waiting.reload();
  };

  return (
    <>
      {/* **読めなかった日に「読んでいます…」と言わない**（面の上と下で
          違うことを言うことになる）。数の行ごと出さず、下の札に任せる。 */}
      {read !== "down" && (
        <p className="mp-now">
          {counted ?
            <>まだ返していないのが <b>{waiting.n}</b> 枚</> :
            "読んでいます…"}
        </p>
      )}
      {/* 棚の札。**机の道具の札（`.mp-tab`）と同じ形にそろえる**——同じ面の
          中で同じ仕事（1つだけ開く）の見た目が2通りあると、別の仕掛けに見える。
          4つなので `is-4`（390px でも折らない） */}
      <div className="mp-tabs is-4" role="tablist" aria-label="付箋の棚">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={`mp-tab${view === v.id ? " is-on" : ""}`}
            onClick={() => setView(v.id)}
          >
            <span className="mp-tab-l">{v.label}</span>
          </button>
        ))}
      </div>
      {read === "down" ?
        /* 読みに行けなかった。**「ぜんぶ返しました。」とは別の顔にする。**
           あれは読めた上でのことばで、届かなかった日に言ってよい嘘ではない。 */
        <ReadAgain what={VIEWS.find((v) => v.id === view)?.label ?? "付箋"} onRetry={reload} /> :
      waitDown ?
        /* 付箋そのものは読めたが、**どれが「まだ」かを数える口が落ちた。**
           絞り込めないので一覧は出せない。前はここで「読んでいます…」を
           回し続けていて、送り直すまで戻れなかった（2026-10-13）。
           **読み直しは数のほうに向ける。** */
        <ReadAgain what="まだ返していないもの" onRetry={waiting.reload} /> :
      reading ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">
          {view === "bin" ? "しまったものはありません。" :
            view === "seen" ? "既読にしたものはありません。" :
              "ぜんぶ返しました。"}
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
              view={view}
              onChanged={(next) => {
                setNotes(
                  (cur) => cur?.map((x) => (x.id === n.id ? next : x)) ?? cur,
                );
                /* 返事を書けば「まだ」から外れる。取り消せば戻る。
                   **札の数を、画面の側で足し引きしない** */
                waiting.reload();
              }}
              onGone={() => drop(n.id)}
            />
          )}
        </Longer>
      )}
    </>
  );
}

/**
 * 1枚。返す・既読にする・しまう。
 * **押しどころは、旅の途中でも押せる大きさにする。**
 */
function StickyRow({
  note,
  view,
  onChanged,
  onGone,
}: {
  note: Sticky;
  /** いまどの棚にいるか。**押しどころの向きが棚で変わる**（既読にする／もどす） */
  view: View;
  onChanged: (n: Sticky) => void;
  /** この棚から外れた（しまった・既読にした・戻した） */
  onGone: () => void;
}) {
  const { token } = useAuth();
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  /* 名前は机で直したぶんが勝つ（`lib/dests.ts`）。貼り先の名前を直したのに
     ここだけ古い名前が残ると、同じ棚が2つ在るように読める。 */
  const { dests } = useDests();
  const th = destById(dests, note.theme);

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
      await archiveSticky(note.id, view !== "bin", t);
      onGone();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 既読にする・もどす。**付箋は1文字も変わらない。**
   *
   * 板からも消えないし、ハートも返信欄も今までどおり。変わるのは
   * 「まだ返していない」の数から外れることだけ。
   *
   * **戻せる**ので押せる。消す押しどころだったら、押し間違いが怖くて
   * 誰も押さない（`/stickies/:id/seen` の注）。
   */
  const mark = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await seenSticky(note.id, view !== "seen", t);
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
        {/* **読んだが、返さないと決めた1枚。** 返す言葉の要らない便りに
            返事を書かないかぎり、その1枚は永久に数に残る。
            しまった棚には出さない——あちらは板から下ろしてあるので、
            まだ返していない数にもう入っていない */}
        {view !== "bin" && (
          <button className="mp-send is-small is-quiet" disabled={busy} onClick={mark}>
            {view === "seen" ? "まだに もどす" : "読んだ"}
          </button>
        )}
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {view === "bin" ? "もどす" : "しまう"}
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
