"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getIdeas, postIdea, rememberVote, voteIdea, votedLocally, type Idea } from "@/lib/api";
import { BOARD } from "@/content/voice";
import { LEGENDS } from "@/content/legends";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import SignIn from "./SignIn";
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

/** 貼ったあと、どうなるか。ここが見えないと、書いても届かない気がして手が止まる。 */
const FLOW = [
  { t: "貼る", n: "名前もログインも要りません" },
  { t: "さんせいが集まる", n: "だれでも押せます。1件につき1回" },
  { t: "企画会議に上がる", n: "週のはじめ。やることになったら「これから」に出ます" },
];

/** 自分が貼った企画。ログインしていない人のために、端末にも覚えておく。 */
const MINE_KEY = "ayato-island-mine";
function minePosts(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function rememberPost(id: string) {
  try {
    const s = minePosts();
    s.add(id);
    localStorage.setItem(MINE_KEY, JSON.stringify([...s]));
  } catch {
    /* localStorage が使えない環境では諦める */
  }
}

/**
 * 企画掲示板。
 *
 * ログインなしで貼れて、投票できる。
 * だからログインの案内は畳んで下に置き、いちばん上は書く場所にする。
 * 票の多いものが目立ち、自分が貼ったもの・さんせいしたものが自分で分かるようにする。
 */
export default function Board() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"votes" | "new">("votes");
  const [onlyMine, setOnlyMine] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const { user, token } = useAuth();

  useEffect(() => {
    setVoted(votedLocally());
    setMine(minePosts());
    getIdeas()
      .then((r) => setIdeas(r.ideas))
      .catch(() => setIdeas([]));
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (t.length < 4) {
      setErr(BOARD.tooShort);
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { idea } = await postIdea(t, name.trim() || undefined, await token());
      setIdeas((cur) => [idea, ...(cur ?? [])]);
      rememberPost(idea.id);
      setMine((m) => new Set([...m, idea.id]));
      setText("");
    } catch (e) {
      setErr(String(e).includes("429") ? BOARD.tooMany : BOARD.failed);
    } finally {
      setSending(false);
    }
  };

  const vote = async (id: string) => {
    if (voted.has(id)) return;
    setIdeas((cur) => cur?.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)) ?? cur);
    rememberVote(id);
    setVoted(new Set([...voted, id]));
    try {
      await voteIdea(id, await token());
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const isMine = (i: Idea) => mine.has(i.id) || (!!user && i.byUid === user.uid);

  const all = [...(ideas ?? [])].sort((a, b) =>
    sort === "votes" ? b.votes - a.votes || (a.createdAt < b.createdAt ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );
  const list = onlyMine ? all.filter(isMine) : all;
  const mineCount = all.filter(isMine).length;
  const totalVotes = all.reduce((n, i) => n + i.votes, 0);
  const pickedCount = all.filter((i) => i.status === "picked").length;
  // 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す
  const pins = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

  return (
    <>
      <section className="panel bd-write">
        <h2>{BOARD.postTitle}</h2>
        <p>
          まじめじゃなくていいです。<b>むちゃな企画ほど、だいたい通ります。</b>
          ログインも名前も要りません。
        </p>

        <textarea
          ref={box}
          className="bin"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={200}
          aria-label="企画の中身"
          placeholder={BOARD.placeholder}
        />
        <div className="brow">
          {user ? (
            <span className="bin bin-locked">{user.name} として出します</span>
          ) : (
            <input
              className="bin"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              aria-label="名前"
              placeholder={BOARD.namePlaceholder}
            />
          )}
          <button className="bbtn" onClick={submit} disabled={sending}>
            {sending ? BOARD.submitting : BOARD.submit}
          </button>
        </div>
        {err && (
          <p className="err">
            <Icon name="alert" size={13} /> {err}
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
                setText((t) => (t.startsWith(s) ? t : s + t));
                box.current?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* 貼ったあとどうなるかが見えないと、書いても届かない気がして手が止まる。
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

        {/* ログインは「しなくていい」ものなので、書く場所より下に、畳んで置く。 */}
        <div style={{ marginTop: 18 }}>
          <Fold title="名前とアイコンも島に出したい" lead="YouTubeのアカウントでログインすると出せます">
            <SignIn />
          </Fold>
        </div>
      </section>

      <section className="panel">
        <h2>むちゃな企画ほど通る、の証拠</h2>
        <p className="muted">どれも「思いつき」から始まって、本当にやったものです。</p>
        <div className="chips" style={{ marginTop: 12 }}>
          {PROOF.map((slug) => {
            const l = LEGENDS.find((x) => x.slug === slug);
            if (!l) return null;
            return (
              <Link className="chip link" href={`/legends/${l.slug}`} key={l.slug}>
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

      <section className="panel">
        <div className="bhead">
          <h2 style={{ margin: 0 }}>{BOARD.listTitle}</h2>
          <div className="bsort">
            <button className={sort === "votes" ? "is-on" : ""} onClick={() => setSort("votes")}>
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

        {all.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <span className="chip">{all.length}件</span>
            <span className="chip">さんせい {totalVotes}</span>
            {pickedCount > 0 && <span className="chip">採用 {pickedCount}件</span>}
            {voted.size > 0 && <span className="chip">さんせいした {voted.size}件</span>}
          </div>
        )}

        {ideas === null && <p className="muted">{BOARD.loading}</p>}
        {ideas?.length === 0 && (
          <>
            <EmptyBoard />
            <p className="muted" style={{ textAlign: "center" }}>
              {BOARD.empty}
            </p>
          </>
        )}
        {ideas !== null && ideas.length > 0 && list.length === 0 && (
          <p className="muted">じぶんが貼ったものは、まだありません。</p>
        )}

        <ul className="bd-list">
          {list.map((i, n) => {
            // 票がいちばん集まっているものだけ、赤い枠で前に出す。
            const top = sort === "votes" && !onlyMine && n === 0 && i.votes > 0 && i.status !== "picked";
            return (
              <li
                key={i.id}
                className={`${i.status === "picked" ? "is-picked" : ""}${top ? " is-top" : ""}`}
              >
                <span className="nx-pin">
                  <Pin tone={pins[n % pins.length]} size={18} />
                </span>
                <button
                  className={`vote${voted.has(i.id) ? " is-on" : ""}`}
                  onClick={() => vote(i.id)}
                  aria-pressed={voted.has(i.id)}
                  aria-label={voted.has(i.id) ? "さんせい済み" : BOARD.agree}
                >
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  <b>{i.votes}</b>
                </button>
                <div className="idea-body">
                  <p>{i.text}</p>
                  <div className="idea-meta">
                    {top && <em>いま、いちばん票が集まってる</em>}
                    {i.status === "picked" && <em>{BOARD.picked}</em>}
                    {isMine(i) && <em>あなたが貼った</em>}
                    {voted.has(i.id) && <span>さんせい済み</span>}
                    {i.name && <span>{i.name} さん</span>}
                    <time>{i.createdAt.slice(0, 10).replace(/-/g, "/")}</time>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
