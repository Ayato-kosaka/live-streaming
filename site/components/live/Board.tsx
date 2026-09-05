"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIdeas, postIdea, rememberVote, voteIdea, votedLocally, type Idea } from "@/lib/api";
import { BOARD } from "@/content/voice";
import { LEGENDS } from "@/content/legends";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import SignIn from "./SignIn";

/** 「むちゃでも通る」ことが伝わる、実際にやった企画。記録の類ではなく企画だけ選ぶ。 */
const PROOF = ["iran-walk", "egypt-festival", "newyear-24h", "roulette-georgia"];

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
 * まだ1件も貼られていないときの絵。
 * 「空っぽ」を字で伝えるより、空の板を見せたほうが早い。
 * 輪郭線は引かず、光は左上から、接地影は右下へずらす（島の絵の決まりごと）。
 */
function EmptyBoard() {
  return (
    <svg viewBox="0 0 96 68" width={128} height={91} aria-hidden style={{ display: "block", margin: "6px auto 0" }}>
      <ellipse cx="50" cy="63" rx="34" ry="4" fill="#9fb28c" opacity="0.3" />
      {/* 板の厚み → 板 */}
      <rect x="10" y="10" width="76" height="50" rx="10" fill="#bd8144" />
      <rect x="10" y="8" width="76" height="50" rx="10" fill="#e3aa6a" />
      <rect x="14" y="12" width="68" height="42" rx="7" fill="#f3e3c8" />
      {/* 貼るところが空いている、という絵。紙は点線ではなく淡い面で置く */}
      <rect x="21" y="19" width="24" height="18" rx="4" fill="#fff6b8" transform="rotate(-3 33 28)" />
      <rect x="51" y="22" width="24" height="18" rx="4" fill="#d6f0ff" transform="rotate(2.5 63 31)" />
      <circle cx="33" cy="20" r="2.6" fill="#e8879a" />
      <circle cx="63" cy="23" r="2.6" fill="#7fd3a2" />
      {/* 空いている場所 */}
      <rect x="34" y="40" width="28" height="11" rx="4" fill="#e9dcc0" />
    </svg>
  );
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

  return (
    <>
      <section className="panel">
        <h2>{BOARD.postTitle}</h2>
        <p>
          まじめじゃなくていいです。<b>むちゃな企画ほど、だいたい通ります。</b>
          ログインも名前も要りません。
        </p>

        <textarea
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

        {/* ログインは「しなくていい」ものなので、書く場所より下に、畳んで置く。 */}
        <div style={{ marginTop: 18 }}>
          <Fold title="名前とアイコンも島に出したい" lead="YouTubeのアカウントでログインすると出せます">
            <SignIn />
          </Fold>
        </div>
      </section>

      <section className="panel">
        <h2>むちゃな企画ほど通る、の証拠</h2>
        <p className="muted">
          どれも「思いつき」から始まって、本当にやったものです。
        </p>
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

        <ul className="ideas">
          {list.map((i, n) => {
            // 票がいちばん集まっているものだけ、板の縁を変えて前に出す。
            const top = sort === "votes" && !onlyMine && n === 0 && i.votes > 0 && i.status !== "picked";
            return (
              <li
                key={i.id}
                className={i.status === "picked" ? "is-picked" : ""}
                style={top ? { borderColor: "var(--accent)", boxShadow: "var(--pg-lit), 0 4px 0 #cf4867" } : undefined}
              >
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
