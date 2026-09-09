"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  archiveSticky,
  getArchivedStickies,
  getStickies,
  heartSticky,
  heartedLocally,
  postSticky,
  rememberHeart,
  replySticky,
  type Sticky,
} from "@/lib/api";
import { shelves, THEMES, themeById, type Theme } from "@/content/themes";
import { useAuth } from "@/lib/auth";
import { useOwner } from "@/components/nordic/log";
import Icon from "@/components/ui/IconCore";
import { Pin } from "./art";

/**
 * みんなの付箋（#160）。
 *
 * ## 何が変わったのか
 *
 * 前は、付箋の宛先が**本文の頭の `【ポーランド】`** だった。入力欄に宛先が
 * 無かったので人がそれを発明して、こちらは正規表現でそれを読んで棚に分けていた。
 * 宛先を正式な欄（`islandNotes.theme`）にしたので、**推測で仕分けるところが
 * 1つも無くなった。** 棚の名前も、本文から取り出した字ではなく
 * `content/themes.ts` が持つ表示名になる。
 *
 * ## 2つの出かた
 *
 * | 渡すもの | どうなるか | どこで |
 * | --- | --- | --- |
 * | `themes` | テーマを選ぶ札が出る | `/board`（島じゅうの付箋） |
 * | `theme` | 1つに決まった状態で出る | `/nordic`・国のページ・区間のページ |
 *
 * **決まった状態で来た人に、もう一度テーマを選ばせない。** 国のページから
 * 書く人は、もうその国の話をしている。
 *
 * ## ハート
 *
 * ログイン不要で、もう一度押すと外れる。押したかどうかは端末に覚えておく
 * （サーバーにも `islandHearts` にあるが、一覧のたびに聞くともう1往復要る）。
 *
 * ## 運営者が立てた付箋
 *
 * `byOwner` の付箋は、いちばん上に出す。おたずねの「選択肢」がこれになる
 * （`islandPolls` の統合先）。だから並び順は、押された数ではなく
 * 「こちらが立てたか」で先に割る。
 */

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/** 1つのテーマに出す枚数の上限。越えたぶんは、そのテーマの面へ送る。 */
const SHOW = 24;

/** 付箋の長さ。サーバー側の `MAX_NOTE_LEN` と同じ。 */
const MAX = 120;

type Props = {
  /** テーマを選ばせる。掲示板はこちら */
  themes?: Theme[];
  /** テーマを決め打ちする。国や区間のページはこちら */
  theme?: string;
  /**
   * 紙と見出しを持たずに、中身だけ出す。
   * 折りたたみの中に置くときに使う。紙の上に紙は重ねない。
   */
  bare?: boolean;
  /** 見出し。省略すると「みんなの付箋」 */
  title?: string;
};

/** 運営者の付箋を先に、そのあとは新しい順。表示のたびに並びが動かないようにする。 */
function ordered(list: Sticky[]): Sticky[] {
  return [...list].sort((a, b) => {
    if (a.byOwner !== b.byOwner) return a.byOwner ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export default function Notes({ themes, theme, bare = false, title }: Props) {
  const fixed = themeById(theme ?? "");
  /** 札に並べるテーマ。決め打ちのときは1つも並べない */
  const shelf = useMemo(() => themes ?? (fixed ? [] : THEMES), [themes, fixed]);
  const [pick, setPick] = useState(
    () => fixed?.id ?? themes?.[0]?.id ?? THEMES[0].id,
  );
  /** 取りに行っている最中は null。0枚と区別する */
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  /** 読めなかったか。空っぽと読めなかったを、同じ顔で出さない */
  const [down, setDown] = useState(false);
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 書く欄が開いているか。**畳んだ状態から始める。** 上に置いたので、
      開きっぱなしにすると 300px ぶん、付箋の山が下へ押し出される */
  const [open, setOpen] = useState(false);
  /** しまったものを見ているか。あやとだけ */
  const [bin, setBin] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const { user, token } = useAuth();
  const owner = useOwner();

  const now = fixed ?? themeById(pick) ?? THEMES[0];

  /* 札を並べ直すのに使う今日。**画面が出てから入れる。**
     静的書き出しなので、ここで `new Date()` を直に呼ぶとビルドした日が
     焼き込まれて、終わった企画がいつまでも「これからの企画」に並ぶ
     （9月6日に終わったフード＆ワイン祭りが、実際にそうなっていた）。 */
  const [today, setToday] = useState<Date | null>(null);
  /** 見出しごとに束ねた札。企画は日付で「これから／行ってきた」に分かれる */
  const groups = useMemo(() => shelves(shelf, today), [shelf, today]);

  useEffect(() => {
    setHearted(heartedLocally());
    setToday(new Date());
  }, []);

  /* 掲示板は1回で全部読む。テーマごとの枚数も、選んだテーマの中身も、
     同じ1回から出せる（枚数を出すには、どのみち全部が要る）。
     テーマが決まっている面は、そのテーマぶんだけを押された順に読む。 */
  useEffect(() => {
    // しまったものを見ているあいだは、下の効果が読む。ここでは触らない
    if (bin) return;
    let gone = false;
    setNotes(null);
    setDown(false);
    getStickies(fixed ? { theme: fixed.id, byHearts: true } : { limit: 300 })
      .then((r) => {
        if (!gone) setNotes(r.notes);
      })
      .catch(() => {
        if (gone) return;
        setNotes([]);
        setDown(true);
      });
    return () => {
      gone = true;
    };
  }, [fixed, bin]);

  /* しまったものを見にいく。あやとが押したときだけ。
     一覧と混ぜて持たないのは、戻したときにどちらへ動いたかが
     分からなくなるため。押すたびに読み直す。 */
  useEffect(() => {
    if (!bin || !owner) return;
    let gone = false;
    setNotes(null);
    setDown(false);
    (async () => {
      const t = await token();
      if (!t || gone) return;
      try {
        const r = await getArchivedStickies(t, fixed?.id);
        if (!gone) setNotes(r.notes);
      } catch {
        if (!gone) setDown(true);
      }
    })();
    return () => {
      gone = true;
    };
  }, [bin, owner, token, fixed]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes ?? []) m.set(n.theme, (m.get(n.theme) ?? 0) + 1);
    return m;
  }, [notes]);

  const list = useMemo(
    () => ordered((notes ?? []).filter((n) => fixed || n.theme === pick)),
    [notes, fixed, pick],
  );

  /* 「まだ1枚も貼られていません」の空札が出ているか。
     空札そのものが押しどころ（「いちばんに貼る」）なので、そのときは
     書く欄を開く段をもう1つ出さない。同じ行き先の押しどころを2つ置かない。 */
  const blank = notes !== null && !down && list.length === 0 && !bin;

  const submit = async () => {
    const t = text.trim();
    if (t.length < 2) {
      setErr("もう少しだけ書いてほしいな");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { note } = await postSticky(
        { theme: now.id, text: t, by: name.trim() || undefined },
        await token(),
      );
      setNotes((cur) => [note, ...(cur ?? [])]);
      setText("");
    } catch (e) {
      setErr(
        String(e).includes("429") ?
          "今日はたくさん貼ってくれた。また明日おねがい。" :
          "いま貼れなかった。少し待って、もう一度。",
      );
    } finally {
      setSending(false);
    }
  };

  /** ハートを押す。**押した瞬間に数字を動かす。** 返事を待つと手応えが遅れる。 */
  const heart = async (n: Sticky) => {
    const on = !hearted.has(n.id);
    setHearted((s) => {
      const next = new Set(s);
      if (on) next.add(n.id);
      else next.delete(n.id);
      return next;
    });
    setNotes(
      (cur) =>
        cur?.map((x) =>
          x.id === n.id ?
            { ...x, hearts: Math.max(0, x.hearts + (on ? 1 : -1)) } :
            x,
        ) ?? cur,
    );
    rememberHeart(n.id, on);
    try {
      const r = await heartSticky(n.id, await token());
      // サーバーが数えた数に合わせ直す。押しっぱなしのズレはここで消える
      setNotes(
        (cur) =>
          cur?.map((x) => (x.id === n.id ? { ...x, hearts: r.hearts } : x)) ??
          cur,
      );
      rememberHeart(n.id, r.on);
      setHearted((s) => {
        const next = new Set(s);
        if (r.on) next.add(n.id);
        else next.delete(n.id);
        return next;
      });
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const stow = async (n: Sticky, on: boolean) => {
    const t = await token();
    if (!t) return;
    // しまったもの／出ているものは別の一覧なので、押したほうから消える
    setNotes((cur) => cur?.filter((x) => x.id !== n.id) ?? cur);
    try {
      await archiveSticky(n.id, on, t);
    } catch {
      setDown(true);
    }
  };

  const inner = (
    <>
      {!bare && <h2>{title ?? "みんなの付箋"}</h2>}
      <p className="muted">
        {fixed ?
          fixed.lead :
          "何について書くかを選んでから貼ります。ハートはログインしなくても押せて、もう一度押すと外れます。"}
      </p>

      {/* テーマの選び札。束ねかたごとに1行にする。
          厚みは1枚ずつ付ける。「付けなくてよい」例外が効くのは
          一面ぜんぶが押せるマスの並びのときだけで、ここは紙の面の途中にある
          （`docs/island-world.md` 3.5）。 */}
      {groups.map((g) => (
        <div className="nb-group" key={g.group}>
          <span className="nb-glabel">{g.group}</span>
          <div className="nb-tabs">
            {g.themes.map((s) => (
              <button
                key={s.id}
                className={`nb-tab${s.id === pick ? " is-on" : ""}`}
                aria-pressed={s.id === pick}
                onClick={() => setPick(s.id)}
              >
                <b>{s.name}</b>
                {(counts.get(s.id) ?? 0) > 0 && <i>{counts.get(s.id)}</i>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* 書く欄。**付箋の山より前に置く。**
          あとに置いていたときは、貼ってある枚数ぶん下までスクロールしないと
          書き出せなかった（あやとが6枚貼った企画で実際にそうなった）。
          読む場所と書く場所は同じ面のまま、指の移動だけ短くする。

          出しっぱなしにはしない。名前・本文・ボタンで 300px 近く取るので、
          開いたままだと今度は付箋の山が画面の外へ出る。押す段を1つ挟む。

          宛先はもう決まっている。名前は本文の前に置く。あとに置いていたときは、
          書き終えた人がそこまで目を戻さず、本文の末尾に「by まこも」と書いていた。 */}
      {!bin && !open && !blank && (
        <button
          className="nt-open"
          onClick={() => {
            setOpen(true);
            // 開いた先へ連れていく。開いただけだと、画面の外で欄が増える
            requestAnimationFrame(() => box.current?.focus());
          }}
        >
          {list.length > 0 ? "自分も書く" : "1枚目を書く"}
          <Icon name="chevron" size={13} />
        </button>
      )}

      {!bin && open && (
        <div className="nt-write">
          <p className="nt-to">
            <span>{now.name}</span>あてに貼ります
          </p>
          <label className="nt-field">
            <span>名前（書かなくてもいい）</span>
            {user ? (
              <span className="bin bin-locked">{user.name} として貼ります</span>
            ) : (
              <input
                className="bin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="呼ばれたい名前"
              />
            )}
          </label>
          <label className="nt-field">
            <span>書くこと</span>
            <textarea
              ref={box}
              className="bin"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={MAX}
              placeholder={now.placeholder}
            />
          </label>
          <div className="brow">
            <button className="bbtn" onClick={submit} disabled={sending}>
              {sending ? "はりだし中…" : "はりだす"}
            </button>
          </div>
          {err && (
            <p className="err">
              <Icon name="alert" size={13} /> {err}
            </p>
          )}
        </div>
      )}

      <div className="nb-board">
        {!fixed && (
          <div className="nb-head">
            <h3 className="sub">{now.name}</h3>
            {list.length > 0 && (
              <span className="bd-count">
                <b>{list.length}</b>枚
              </span>
            )}
            {now.href && (
              <Link className="nb-go" href={now.href} prefetch={false}>
                この話をしている場所へ
                <Icon name="right" size={13} />
              </Link>
            )}
          </div>
        )}

        {/* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く
            （`docs/island-world.md` 4.1）。 */}
        {notes === null && (
          <ul className="nx-notes is-wait" aria-hidden>
            <li />
            <li />
            <li />
          </ul>
        )}

        {notes !== null && down && (
          <div className="blank is-off">
            <b>いま、付箋を読みに行けなかった</b>
            <p>貼ってある日でも、こういうときは出てきません。少し待って、もう一度。</p>
          </div>
        )}

        {notes !== null && !down && list.length === 0 && (
          <div className="blank">
            <b>{bin ? "しまったものはありません" : "まだ1枚も貼られていません"}</b>
            {/* **書く欄が開いているかで、言うことを変える。**
                開いたあとも「押すと、書く欄がひらきます」と言い続けていたころ、
                すぐ上に開いている欄を指して、もう一度開く札が出ていた。 */}
            <p>
              {bin ?
                "二重投稿や、荒れたものをしまうと、ここに残ります。消えてはいません。" :
                open ?
                  `上の欄に書くと、${now.name}あての1枚目になります。` :
                  `${now.name}あての1枚目になれます。押すと、書く欄がひらきます。`}
            </p>
            {!bin && !open && (
              <button
                className="blank-go"
                onClick={() => {
                  // 書く欄はこの上にある。開いてから、そこへ連れていく
                  setOpen(true);
                  requestAnimationFrame(() => {
                    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    box.current?.focus({ preventScroll: true });
                  });
                }}
              >
                いちばんに貼る
                <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        )}

        <ul className="nx-notes">
          {list.slice(0, SHOW).map((n, i) => (
            <li key={n.id} className={n.byOwner ? "is-owner" : undefined}>
              <span className="nx-pin">
                <Pin tone={PINS[i % PINS.length]} size={19} />
              </span>
              {/* 運営者が立てた付箋。おたずねの選択肢がこれになる。
                  誰が立てたのかを言わないと、押された数の意味が変わる */}
              {n.byOwner && <em className="nt-owner">あやとから</em>}
              {n.text}
              {n.by && <em className="nb-by">{n.by} さん</em>}

              {/* あやとからの返信。紙の上の紙なので、厚みは付けない */}
              {n.reply && (
                <span className="nt-reply">
                  <i>あやと</i>
                  {n.reply}
                </span>
              )}

              <span className="nt-foot">
                <button
                  className={`nt-heart${hearted.has(n.id) ? " is-on" : ""}`}
                  onClick={() => heart(n)}
                  aria-pressed={hearted.has(n.id)}
                  aria-label={hearted.has(n.id) ? "ハートを外す" : "ハートを押す"}
                >
                  {/* 絵文字は使わない。同じ形を `Board.tsx` の企画のハートも描いている */}
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  <b>{n.hearts}</b>
                </button>
                {owner && (
                  <OwnerTools
                    note={n}
                    onReply={(reply, repliedAt) =>
                      setNotes(
                        (cur) =>
                          cur?.map((x) =>
                            x.id === n.id ?
                              {
                                ...x,
                                reply: reply ?? undefined,
                                repliedAt: repliedAt ?? undefined,
                              } :
                              x,
                          ) ?? cur,
                      )
                    }
                    onStow={(on) => stow(n, on)}
                    stowed={bin}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* ここに全部は出さない。1つのテーマが長くなるほど、下が見えなくなる。
            続きは上の「この話をしている場所へ」から。**行き先を2つ置かない** */}
        {list.length > SHOW && (
          <p className="nb-more">
            {fixed ?
              `新しいものから${SHOW}枚まで出しています。` :
              `新しいものから${SHOW}枚まで。残り${list.length - SHOW}枚は、この話をしている場所で読めます。`}
          </p>
        )}
      </div>

      {/* しまったものを見る。あやとだけ。**消していないので、戻せる。** */}
      {owner && (
        <button className="nt-bin" onClick={() => setBin((v) => !v)}>
          {bin ? "貼ってあるものに戻る" : "しまったものを見る"}
          <Icon name={bin ? "left" : "right"} size={13} />
        </button>
      )}
    </>
  );

  // 面は紙。板にするのは押すもの・書くものだけ（`docs/island-world.md` 2.1）
  return bare ? inner : <section className="panel paper">{inner}</section>;
}

/**
 * あやとの道具。**1枚につき、返信としまうの2つだけ。**
 *
 * 出るかどうかは `/me` の `admin` で決めているが、それは道具を出すかどうかの
 * 話でしかない。実際に書けるかは、書く先の口がもう一度見ている
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 */
function OwnerTools({
  note,
  onReply,
  onStow,
  stowed,
}: {
  note: Sticky;
  onReply: (reply: string | null, repliedAt: string | null) => void;
  onStow: (on: boolean) => void;
  stowed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const { token } = useAuth();

  const save = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    try {
      const r = await replySticky(note.id, text.trim(), t);
      onReply(r.reply, r.repliedAt);
      setOpen(false);
    } catch {
      /* 書けなかったら、開いたまま。書いた字は消さない */
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="nt-own">
      <button className="nt-obtn" onClick={() => setOpen((v) => !v)}>
        {note.reply ? "返信を直す" : "返信する"}
      </button>
      <button className="nt-obtn" onClick={() => onStow(!stowed)}>
        {stowed ? "もどす" : "しまう"}
      </button>
      {open && (
        <span className="nt-obox">
          <textarea
            className="bin"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="ここに返す。空にすると取り消し"
          />
          <button className="bbtn" onClick={save} disabled={busy}>
            {busy ? "送っています…" : "返す"}
          </button>
        </span>
      )}
    </span>
  );
}
