"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  EMPTY_PLAN,
  PLAN_STATUS_NAME,
  archiveNextPlan,
  canEditPlan,
  getArchivedPlans,
  getNextPlans,
  getPoll,
  heartNextPlan,
  heartedLocally,
  myPlans,
  pollAnswer,
  postNextPlan,
  rememberHeart,
  rememberMyPlan,
  setPlanStatus,
  type NextPlan,
  type PlanStatus,
} from "@/lib/api";
import { BOARD } from "@/content/voice";
import { THEMES } from "@/content/themes";
import { LEGENDS } from "@/content/legends";
import { PLANS } from "@/content/plans";
import { useAuth } from "@/lib/auth";
import { useOwner } from "@/components/nordic/log";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import SignIn from "./SignIn";
import Notes from "./Notes";
import { EmptyBoard, Pin, Stone } from "./art";

/** 「むちゃでも通る」ことが伝わる、実際にやった企画。記録の類ではなく企画だけ選ぶ。 */
const PROOF = ["iran-walk", "egypt-festival", "newyear-24h", "roulette-georgia"];

/**
 * 書き出しの見本。
 *
 * 空の枠と「はりだす」だけ置いても、人は何も書けない。
 * 押すと書き出しが入って、続きだけ書けばいい形にする。
 * 見本そのものが「このくらい無茶でいい」という合図にもなる。
 */
const SEEDS = [
  "1日だけ、",
  "視聴者が決めた道を、",
  "食材しばりで、",
  "現地の人に聞いて、",
];

/**
 * 出したあと、どうなるか。
 *
 * ここが見えないと、書いても届かない気がして手が止まる。
 * **入れ物を1つにしたので（#161）、3歩目が「別の場所」ではなくなった。**
 * 同じ企画が段（`status`）を進んでいくだけになる。
 */
const FLOW = [
  { t: "出す", n: "題ひとつでいい。名前もログインも要りません" },
  { t: "そだてる", n: "日にちも場所も写真も、あとから足せます" },
  { t: "日にちが決まる", n: "「これから」に上がって、ページが1枚立ちます" },
];

/** 段ごとの並び。**提案がいちばん上。** 出した人の目に、まず自分のものが入る。 */
const SHELVES: { id: PlanStatus; lead: string }[] = [
  { id: "proposed", lead: "まだ日にちが決まっていない、みんなの案。" },
  { id: "next", lead: "日にちが決まったもの。ページが1枚立っています。" },
  { id: "done", lead: "行ってきたもの。語り継がれると、伝説の企画になります。" },
];

/** Git 側に立っている企画1つ。`content/plans.ts` か `content/legends.ts` にある。 */
type GitPlan = { id: string; label: string; href: string };

/**
 * ページとして立った企画の行き先。
 *
 * 提案の `planId`（あやとが結び付けた Git 側の id）から、実際のページを引く。
 * **結び付いていないものには、行き先を作らない。** 「これから」と書いてあるのに
 * 押しても何も無い札は、壊れているのと同じ。
 */
function gitPlanLink(planId?: string): GitPlan | null {
  if (!planId) return null;
  const l = LEGENDS.find((x) => x.slug === planId);
  if (l) return { id: l.slug, label: l.title, href: `/legends/${l.slug}` };
  const p = PLANS.find((x) => x.id === planId);
  if (p) return { id: p.id, label: p.title, href: p.href ?? "/next" };
  return null;
}

/**
 * 結び付いていないが、**Git 側にはもうページが立っている**もの。
 *
 * 段（`status`）と Git 側の企画は、別々に動く。清書して
 * `content/plans.ts` にページを立てても、掲示板の段は誰かが動かすまで
 * 「提案」のままで、その食い違いは画面のどこにも出なかった。
 * ジョージアバイバイと海外出発二周年が、実際にそうなっていた。
 *
 * **題も日付も1字も違わないものだけを候補にする。** 似ているだけのものを
 * 拾うと、別の企画のページへ連れていく札ができる。見つけても勝手には結ばない。
 * **あやとに「食い違っている」と見せて、押してもらう。**
 */
function gitPlanLike(p: NextPlan): GitPlan | null {
  const title = p.title.trim();
  if (!title || !p.date) return null;
  const plan = PLANS.find((x) => x.title.trim() === title && x.date === p.date);
  if (plan) return { id: plan.id, label: plan.title, href: plan.href ?? "/next" };
  const l = LEGENDS.find((x) => x.title.trim() === title && x.date === p.date);
  return l ? { id: l.slug, label: l.title, href: `/legends/${l.slug}` } : null;
}

/**
 * 企画をだす（掲示板）。
 *
 * ## 入れ物が1つになった（#161）
 *
 * 前は「一言の提案（`islandIdeas`・120字）」と「ページ1枚の下書き
 * （`islandDrafts`・12,000字・ログイン必須）」に割れていて、
 * **一言を出したあと下書きへ進む道がありませんでした。**
 * 同じものの粒度違いなので、`islandNextPlans` 1つにまとめてある。
 *
 * ここで出すのは題ひとつ。日にちも場所も本文も写真も、あとから
 * `/next/new?id=…` で足して育てられる。出したあとの1行がそこへつないでいる。
 *
 * ## 段（status）
 *
 * 提案 → これから → やった。段を進めるのはあやとで、
 * 「これから」に上がったものは Git 側の企画（`content/plans.ts`）と結び付く。
 * その結び付きが読めないと、掲示板と `/next` が他人のままになる。
 *
 * ## 何をどこへ書くか
 *
 * ここが受けるのは **「まだ無い企画」だけ**。すでに決まっている旅への注文は、
 * 宛先を持った付箋（`Notes`）のほうへ回る。本番のデータでは、提案8件のうち
 * 7件が実際には後者だった（#159）。分かれ道は面の上から見えていないと
 * 意味がないので、「企画をだす」と「みんなの付箋」を同じ面に、この順で並べてある。
 */
export default function Board() {
  const [plans, setPlans] = useState<NextPlan[] | null>(null);
  /** 一覧が読めなかったか。空っぽと読めなかったを、同じ顔で出さないための印。 */
  const [down, setDown] = useState(false);
  /** 今夜のおたずねで押した1票。橋を渡ってきた人だけ、ここに入っている。 */
  const [ask, setAsk] = useState<{ question: string; label: string } | null>(null);
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  /** いま出したもの。出したあと、それをどう育てるかを言うために持つ。 */
  const [posted, setPosted] = useState<NextPlan | null>(null);
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"hearts" | "new">("hearts");
  const [onlyMine, setOnlyMine] = useState(false);
  /** 画面が出てから決める。焼き込みの時刻で「もう直せない」と言わないため */
  const [now, setNow] = useState<number | null>(null);
  /** しまったものを見ているか。あやとだけ */
  const [bin, setBin] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const { user, token } = useAuth();
  const owner = useOwner();

  useEffect(() => {
    setHearted(heartedLocally());
    setMine(myPlans());
    setNow(Date.now());
    load();

    /* 「押す」から「書く」への橋を、渡ってきた側で受ける。
       島で今夜のおたずねを押した人は、押した直後に「理由も書ける？」で
       ここへ来る（`docs/island-play.md` 7章）。ところが着いた先は
       まっさらな入力欄で、何の話をしていたのかが消えている。
       自分が押した札をここでもう一度見せて、その続きから書けるようにする。
       押していない人には何も出さない。 */
    getPoll()
      .then(({ poll }) => {
        if (!poll) return;
        const mineOption = pollAnswer(poll.id);
        const picked = poll.options.find((o) => o.id === mineOption);
        if (picked) setAsk({ question: poll.question, label: picked.label });
      })
      .catch(() => {
        /* おたずねが読めない日は、ただ橋が出ないだけ。ここで謝らない */
      });
  }, []);

  /**
   * 一覧を取りに行く。
   *
   * **読めなかったときに「まだ何も貼られていない」と出さない。**
   * 前はここで空配列を入れていたので、つながらない日には
   * 誰かが出した企画が並んでいる板を「いちばん乗りだよ」と言って見せていた。
   * 嘘をつくくらいなら、つながらないと言って、もう一度押せるようにする
   * （`docs/island-world.md` 4.1 の表）。
   */
  const load = () => {
    setDown(false);
    setBin(false);
    getNextPlans()
      .then((r) => setPlans(r.plans))
      .catch(() => {
        setPlans([]);
        setDown(true);
      });
  };

  /* しまったものを見にいく。あやとが押したときだけ。
     一覧と混ぜて持たないのは、戻したときにどちらへ動いたかが
     分からなくなるため（付箋と同じ作り）。 */
  const loadBin = async () => {
    const t = await token();
    if (!t) return;
    setPlans(null);
    setDown(false);
    setBin(true);
    try {
      const r = await getArchivedPlans(t);
      setPlans(r.plans);
    } catch {
      setPlans([]);
      setDown(true);
    }
  };

  const submit = async () => {
    const t = title.trim();
    if (t.length < 4) {
      setErr(BOARD.tooShort);
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { plan } = await postNextPlan(
        { ...EMPTY_PLAN, title: t, by: name.trim() || undefined },
        await token(),
      );
      setPlans((cur) => [plan, ...(cur ?? [])]);
      rememberMyPlan(plan.id);
      setMine((m) => new Set([...m, plan.id]));
      setTitle("");
      // 出したものはハートが0なので、人気順のままだといちばん下に沈む。
      // 「出せました」と言った先が空だと、出せていないのと同じ。
      setSort("new");
      setPosted(plan);
    } catch (e) {
      setErr(String(e).includes("429") ? BOARD.tooMany : BOARD.failed);
    } finally {
      setSending(false);
    }
  };

  /** ハートを押す。**押した瞬間に数字を動かす。** 返事を待つと手応えが遅れる。 */
  const heart = async (p: NextPlan) => {
    const on = !hearted.has(p.id);
    setHearted((s) => {
      const next = new Set(s);
      if (on) next.add(p.id);
      else next.delete(p.id);
      return next;
    });
    setPlans(
      (cur) =>
        cur?.map((x) =>
          x.id === p.id ? { ...x, hearts: Math.max(0, x.hearts + (on ? 1 : -1)) } : x,
        ) ?? cur,
    );
    rememberHeart(p.id, on);
    try {
      const r = await heartNextPlan(p.id, await token());
      // サーバーが数えた数に合わせ直す。押しっぱなしのズレはここで消える
      setPlans((cur) => cur?.map((x) => (x.id === p.id ? { ...x, hearts: r.hearts } : x)) ?? cur);
      rememberHeart(p.id, r.on);
      setHearted((s) => {
        const next = new Set(s);
        if (r.on) next.add(p.id);
        else next.delete(p.id);
        return next;
      });
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  /** しまう・戻す。**あやとだけ。消さない。** ハートの数はそのまま残る。 */
  const stow = async (p: NextPlan, on: boolean) => {
    const t = await token();
    if (!t) return;
    // しまったもの／出ているものは別の一覧なので、押したほうから消える
    setPlans((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    try {
      await archiveNextPlan(p.id, on, t);
    } catch {
      setDown(true);
    }
  };

  const isMine = (p: NextPlan) => mine.has(p.id) || (!!user && p.byUid === user.uid);

  /* 並べ替えの前に、**段でひとまとまりにする。**
     まぜて数の順に並べると、行ってきた企画がハートを持っているぶんだけ上に来て、
     まだ決まっていない提案が下に沈む。この板の用事は「まだ無い企画を出す」ほうなので、
     提案 → これから → やった の順に置いてから、その中で数の順・新しい順にする。 */
  const all = useMemo(() => {
    const rank = (p: NextPlan) => SHELVES.findIndex((s) => s.id === p.status);
    return [...(plans ?? [])].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (sort === "hearts" ?
          b.hearts - a.hearts || (a.createdAt < b.createdAt ? 1 : -1) :
          a.createdAt < b.createdAt ? 1 : -1),
    );
  }, [plans, sort]);
  const list = onlyMine ? all.filter(isMine) : all;
  const mineCount = all.filter(isMine).length;
  const totalHearts = all.reduce((n, p) => n + p.hearts, 0);
  // 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す
  const pins = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

  return (
    <>
      <section className="panel paper bd-write">
        <h2>{BOARD.postTitle}</h2>
        <p>
          まじめじゃなくていい。{BOARD.postNote}
          <b>ログインも名前も要りません。</b>
        </p>
        {/* 何あてに書くのかを、書かせる前に言う。ここが無かったせいで、
            提案8件のうち7件が「決まっている旅への注文」になっていた（#159）。 */}
        <p className="muted">{BOARD.postElse}</p>

        {/* 島で押してきた人だけに出る。押した札をそのまま見せて、
            書き出しまで入れておく。ここで「何の話だっけ」に戻さない。 */}
        {ask && (
          <div className="bd-bridge">
            <b>さっき「{ask.label}」を押しましたね</b>
            <i>{ask.question}</i>
            <button
              className="bd-bridge-go"
              onClick={() => {
                const seed = `${ask.label}で、`;
                setTitle((t) => (t.startsWith(seed) ? t : seed + t));
                box.current?.focus();
              }}
            >
              その続きから書く
              {/* 行き先は下の入力欄。矢印もそちらを向ける */}
              <Icon name="chevron" size={13} />
            </button>
          </div>
        )}

        {/* 名前は本文より前。**後ろに置くと、本文の末尾に名乗る人が出る。**
            「アウシュビッツ、雑貨、家具 by まこも」が本番に貼られていて、
            あれは名前欄が入力欄の下、送信ボタンの隣にあって見えていなかった。
            札の字も、下書きの灰色ではなく読ませる字にする。 */}
        <label className="nt-field">
          <span>{BOARD.nameLabel}</span>
          {user ? (
            <span className="bin bin-locked">{user.name} として出します</span>
          ) : (
            <input
              className="bin"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder={BOARD.namePlaceholder}
            />
          )}
        </label>
        <label className="nt-field" style={{ marginTop: "var(--sp-3)" }}>
          <span>{BOARD.textLabel}</span>
          <textarea
            ref={box}
            className="bin"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={2}
            maxLength={60}
            placeholder={BOARD.placeholder}
          />
        </label>
        <div className="brow">
          <button className="bbtn" onClick={submit} disabled={sending}>
            {sending ? BOARD.submitting : BOARD.submit}
          </button>
        </div>
        {err && (
          <p className="err">
            <Icon name="alert" size={13} /> {err}
          </p>
        )}

        {/* 出したあと、画面の上のほうは入力欄が空になるだけで、何も起きていないように見える。
            **ここが「一言から下書きへ進む道」**（#161）。出したその足で、
            日にちも場所も写真も足しにいける。 */}
        {posted && (
          <p className="bd-done">
            <b>出せました。</b>
            日にち・場所・本文・リンク・写真は、あとから足せます。
            <Link className="bd-done-go" href={`/next/new?id=${posted.id}`} prefetch={false}>
              くわしく書く
              <Icon name="chevron" size={13} />
            </Link>
          </p>
        )}

        <div className="nx-seeds">
          <span>書き出しを選ぶ</span>
          {SEEDS.map((s) => (
            <button
              key={s}
              className="nx-seed"
              onClick={() => {
                // すでに書いてあるものを消さない。書き出しは前に足すだけ
                setTitle((t) => (t.startsWith(s) ? t : s + t));
                box.current?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* 出したあとどうなるかが見えないと、書いても届かない気がして手が止まる。
            3歩ぶんだけ、先に見せておく。 */}
        <ol className="bd-flow">
          {FLOW.map((f, i) => (
            <li key={f.t}>
              <span className="nx-stone">
                <Stone tone={i === 0 ? "now" : "stone"} />
                <b>{i + 1}</b>
              </span>
              <span>
                <b>{f.t}</b>
                <i>{f.n}</i>
              </span>
            </li>
          ))}
        </ol>

        {/* はじめからページ1枚で書きたい人の道。**ログインは要らない。**
            前は「あやとが声をかけた人だけ」だった（#161 で開けた）。 */}
        <Link className="tile" href="/next/new" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
          <span className="tile-text">
            <b>はじめからページ1枚で書く</b>
            <i>題・日付・場所・本文・リンク・写真まで、いちどに</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>

        {/* ログインは「しなくていい」ものなので、書く場所より下に、畳んで置く。

            **入っている人には畳まない（#163）。** 島での見え方とログアウトは
            ここの折りたたみの中にあって、あやとにも「見つからない」と
            言われ続けた（#152）。中身はじぶんのこと（`/me`）へ移したので、
            ここに残すのは**行き先の1行だけ**にする。畳みの向こうに
            行き先まで隠すと、移した先が前より遠くなる。 */}
        <div style={{ marginTop: "var(--sp-4)" }}>
          {user ? (
            <SignIn />
          ) : (
            <Fold title="名前とアイコンも島に出したい" lead="YouTubeのアカウントでログインすると出せます">
              <SignIn />
            </Fold>
          )}
        </div>
      </section>

      <section className="panel paper">
        <h2>むちゃな企画ほど通る、の証拠</h2>
        <p className="muted">どれも「思いつき」から始まって、本当にやったものです。</p>
        <div className="chips" style={{ marginTop: "var(--sp-3)" }}>
          {PROOF.map((slug) => {
            const l = LEGENDS.find((x) => x.slug === slug);
            if (!l) return null;
            return (
              <Link className="chip link" href={`/legends/${l.slug}`} key={l.slug} prefetch={false}>
                {l.title}
                <Icon name="right" size={12} />
              </Link>
            );
          })}
          <Link className="chip link" href="/legends">
            ぜんぶ見る
            <Icon name="right" size={12} />
          </Link>
        </div>
      </section>

      {/* 島じゅうの付箋を、宛先（テーマ）ごとにまとめて読む。
          この板に出された**企画**は下にそのまま並ぶので、ここには集めない
          （同じものが1つの面に2回出る）。 */}
      <Notes themes={THEMES} />

      <section className="panel paper">
        {/* 見出しは紙の札。`.bhead` の中に入れると板の木札のままになるので、
            パネルの直下に出して、並べ替えは次の行に置く。 */}
        <h2>{BOARD.listTitle}</h2>
        {/* 1件も無いのに並べ替えの札だけ出ていると、空の板がさらに空に見える */}
        {all.length > 0 && (
          <div className="bhead">
            <div className="bsort">
              <button className={sort === "hearts" ? "is-on" : ""} onClick={() => setSort("hearts")}>
                {BOARD.sortVotes}
              </button>
              <button className={sort === "new" ? "is-on" : ""} onClick={() => setSort("new")}>
                {BOARD.sortNew}
              </button>
              {mineCount > 0 && (
                <button className={onlyMine ? "is-on" : ""} onClick={() => setOnlyMine((v) => !v)}>
                  じぶんの{mineCount}
                </button>
              )}
            </div>
          </div>
        )}

        {all.length > 0 && (
          <div className="chips" style={{ marginBottom: "var(--sp-3)" }}>
            <span className="chip">{all.length}件</span>
            <span className="chip">ハート {totalHearts}</span>
            {SHELVES.map((s) => {
              const n = all.filter((p) => p.status === s.id).length;
              return n > 0 ? (
                <span className="chip" key={s.id}>
                  {PLAN_STATUS_NAME[s.id]} {n}
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* 取りに行っているあいだは、出てくる紙と同じ形の灰色を3枚置く。
            「読み込み中…」の字だけだと、板に何も無いのか取りに行っているのか分からない。 */}
        {plans === null && (
          <ul className="bd-list is-wait" aria-hidden>
            <li />
            <li />
            <li />
          </ul>
        )}
        {plans !== null && down && (
          <div className="blank is-off">
            <b>いま、板を読みに行けなかった</b>
            <p>出してある企画がある日でも、こういうときは出てきません。少し待って、もう一度。</p>
            <button className="blank-go" onClick={load}>
              もう一度よみこむ
              <Icon name="refresh" size={14} />
            </button>
          </div>
        )}
        {!down && plans?.length === 0 && (
          <div className="bd-empty">
            <EmptyBoard />
            <p className="muted">{BOARD.empty}</p>
            {/* 空の板を見せるだけだと、そこで終わる。
                書く場所は上にあるので、押したらそこへ連れていって、枠に入れる。 */}
            <button
              className="bd-empty-go"
              onClick={() => {
                box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                box.current?.focus({ preventScroll: true });
              }}
            >
              いちばんに出す
              <Icon name="up" size={13} />
            </button>
          </div>
        )}
        {plans !== null && plans.length > 0 && list.length === 0 && (
          <p className="muted">じぶんが出したものは、まだありません。</p>
        )}

        <ul className="bd-list">
          {list.map((p, n) => {
            // ハートがいちばん集まっているものだけ、赤い枠で前に出す。
            const top = sort === "hearts" && !onlyMine && n === 0 && p.hearts > 0 && p.status === "proposed";
            const edit = now ? canEditPlan(p, user?.uid, mine, now) : "no";
            const link = gitPlanLink(p.planId);
            /* 結び付いていないのに、Git 側にはページが立っているもの。
               **あやとにだけ見せる。** 直せるのはあやとだけなので、
               見ている人に食い違いを言っても、待つことしかできない。 */
            const like = !p.planId ? gitPlanLike(p) : null;
            /* 結び付け先の id が Git 側に無い。打ち間違えたか、
               ページのほうを消したか。どちらにしても押せる先が無い。 */
            const lost = !!p.planId && !link;
            return (
              <li
                key={p.id}
                id={`plan-${p.id}`}
                className={`${p.status !== "proposed" ? "is-picked" : ""}${top ? " is-top" : ""}`}
              >
                <span className="nx-pin">
                  <Pin tone={pins[n % pins.length]} size={18} />
                </span>
                <button
                  className={`vote${hearted.has(p.id) ? " is-on" : ""}`}
                  onClick={() => heart(p)}
                  aria-pressed={hearted.has(p.id)}
                  aria-label={hearted.has(p.id) ? "ハートを外す" : "ハートを押す"}
                >
                  {/* 絵文字は使わない。同じ形を付箋（`Notes.tsx`）も描いている */}
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  <b>{p.hearts}</b>
                </button>
                <div className="idea-body">
                  <p>{p.title}</p>
                  {/* 育ったぶん。ひとことがあれば、題のすぐ下に出す */}
                  {p.note && <p className="bd-note">{p.note}</p>}
                  <div className="idea-meta">
                    {top && <em>いま、いちばんハートが集まってる</em>}
                    {p.status !== "proposed" && <em>{PLAN_STATUS_NAME[p.status]}</em>}
                    {isMine(p) && <em>あなたが出した</em>}
                    {p.when && <span>{p.when}</span>}
                    {!p.when && p.date && <span>{p.date.replace(/-/g, "/")}</span>}
                    {p.place.name && <span>{p.place.name}</span>}
                    {p.by && <span>{p.by} さん</span>}
                    <time>{p.createdAt.slice(0, 10).replace(/-/g, "/")}</time>
                  </div>
                  {/* 段が進んで、ページが立ったもの。**その場所まで連れていく。**
                      「これから」と書いてあるだけでは、どこにあるのか分からない。 */}
                  {link && (
                    <Link className="bd-go" href={link.href} prefetch={false}>
                      {link.label}のページへ
                      <Icon name="right" size={13} />
                    </Link>
                  )}
                  {/* 育てる道。**直せる人にだけ出す。**
                      出せない人に出すと、押した先で 403 を見ることになる。 */}
                  {edit === "ok" && (
                    <Link className="bd-go" href={`/next/new?id=${p.id}`} prefetch={false}>
                      {p.about.length || p.photos.length ? "続きを書く" : "くわしく書く"}
                      <Icon name="right" size={13} />
                    </Link>
                  )}
                  {edit === "expired" && (
                    <span className="bd-locked">
                      出してから1日たったので、もう直せません。ログインして出すと、あとからでも直せます。
                    </span>
                  )}
                  {/* 段と Git 側が食い違っている。**あやとにだけ、その場で言う。**
                      掲示板を見にきた日に気づけないと、清書したページと
                      「提案」の札が何日も並んだままになる。 */}
                  {owner && like && (
                    <span className="bd-mismatch">
                      「{like.label}」のページが立っているのに、段が
                      {PLAN_STATUS_NAME[p.status]}のままです。下の「段を動かす」で結び付けてください。
                    </span>
                  )}
                  {owner && lost && (
                    <span className="bd-mismatch">
                      結び付け先（{p.planId}）が Git 側にありません。id を直すか、空にして外してください。
                    </span>
                  )}
                  {owner && (
                    <PlanOwnerTools
                      plan={p}
                      suggest={like}
                      stowed={bin}
                      onStow={(on) => stow(p, on)}
                      onStage={(next) =>
                        setPlans((cur) => cur?.map((x) => (x.id === next.id ? next : x)) ?? cur)
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* しまったものを見る。あやとだけ。**消していないので、戻せる。** */}
        {owner && (
          <button className="nt-bin" onClick={() => (bin ? load() : loadBin())}>
            {bin ? "出ているものに戻る" : "しまったものを見る"}
            <Icon name={bin ? "left" : "right"} size={13} />
          </button>
        )}

        {/* 段（提案 → これから → やった）が、島のどこへ続いているのか。
            **入れ物は1つでも、ページは別の面に立つ。** そこがつながっていないと、
            板に出したものが、そのあとどうなったのか読めない。 */}
        <div className="bd-road">
          {SHELVES.map((s) => (
            <p key={s.id}>
              <b>{PLAN_STATUS_NAME[s.id]}</b>
              {s.lead}
            </p>
          ))}
        </div>
        <Link className="tile" href="/next">
          <img className="tile-icon" src="/sprites/tent.webp" alt="" />
          <span className="tile-text">
            <b>これから</b>
            <i>日にちが決まった企画。いま {PLANS.length} つ立っています</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link className="tile" href="/legends">
          <img className="tile-icon" src="/sprites/hall-museum.webp" alt="" />
          <span className="tile-text">
            <b>伝説の企画</b>
            <i>いまも話に出てくる、終わった企画が{LEGENDS.length}つ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      </section>
    </>
  );
}

/**
 * あやとの道具。**1件につき、段を進めるのとしまうの2つだけ。**
 *
 * 段（提案 → これから → やった）を動かせるのはここだけ。「これから」に上げるとき、
 * Git 側の企画の id を一緒に結び付ける。**結び付けないと、掲示板に出た提案と
 * 実際に立っているページが、画面の上で他人のままになる。**
 *
 * 出るかどうかは `/me` の `admin` で決めているが、それは道具を出すかどうかの
 * 話でしかない。実際に書けるかは、書く先の口がもう一度見ている
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 */
function PlanOwnerTools({
  plan,
  suggest,
  stowed,
  onStage,
  onStow,
}: {
  plan: NextPlan;
  /** Git 側に立っているのに結び付いていないページ。**あれば先に入れておく** */
  suggest?: GitPlan | null;
  stowed: boolean;
  onStage: (next: NextPlan) => void;
  onStow: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  /* 食い違いが見つかっているときは、選び直さなくてよいところまで入れておく。
     id を手で打ち直させると、また打ち間違えて結び直すことになる。
     **押すのは人。** 開いた欄を見て「動かす」を押すまでは1件も動かない。 */
  const [status, setStatus] = useState<PlanStatus>(
    suggest && plan.status === "proposed" ? "next" : plan.status,
  );
  const [planId, setPlanId] = useState(plan.planId ?? suggest?.id ?? "");
  const [busy, setBusy] = useState(false);
  /** 動かせなかった理由。**黙って閉じない。** */
  const [err, setErr] = useState<string | null>(null);
  const { token } = useAuth();

  const save = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await setPlanStatus(plan.id, status, planId.trim(), t);
      onStage(r.plan);
      setOpen(false);
    } catch (e) {
      /* 動かせなかったら、開いたまま。選んだものは消さない。
         いちばん出るのが「その id は別の行が持っている」で、これは
         同じ企画の行が2つある印なので、何が起きたかを言わないと
         押し直すしかできない。 */
      setErr(
        String(e).includes("409") ?
          "その id は、もう別の行が持っています。そちらを先にしまってください。" :
          "いま動かせなかった。少し待って、もう一度。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="bd-own">
      <button className="nt-obtn" onClick={() => setOpen((v) => !v)}>
        段を動かす
      </button>
      <button className="nt-obtn" onClick={() => onStow(!stowed)}>
        {stowed ? "もどす" : "しまう"}
      </button>
      {open && (
        <span className="nt-obox">
          <select className="bin" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
            {(Object.keys(PLAN_STATUS_NAME) as PlanStatus[]).map((s) => (
              <option value={s} key={s}>
                {PLAN_STATUS_NAME[s]}
              </option>
            ))}
          </select>
          <input
            className="bin"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            maxLength={40}
            placeholder="立ったページの id（nordic / iran-walk）。空で外す"
          />
          <button className="bbtn" onClick={save} disabled={busy}>
            {busy ? "動かしています…" : "動かす"}
          </button>
          {err && <span className="bd-mismatch">{err}</span>}
        </span>
      )}
    </span>
  );
}
