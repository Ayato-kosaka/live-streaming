"use client";

import { useEffect, useState } from "react";
import { getIdeas, postIdea, rememberVote, voteIdea, votedLocally, type Idea } from "@/lib/api";

export default function Board() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"votes" | "new">("votes");

  useEffect(() => {
    setVoted(votedLocally());
    getIdeas()
      .then((r) => setIdeas(r.ideas))
      .catch(() => setIdeas([]));
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (t.length < 4) {
      setErr("もう少しだけ詳しく書いてください（4文字以上）");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { idea } = await postIdea(t, name.trim() || undefined);
      setIdeas((cur) => [idea, ...(cur ?? [])]);
      setText("");
    } catch (e) {
      setErr(
        String(e).includes("429")
          ? "今日はたくさん出してくれました。また明日お願いします。"
          : "いま送れませんでした。少し時間をおいて試してください。",
      );
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
      await voteIdea(id);
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const list = [...(ideas ?? [])].sort((a, b) =>
    sort === "votes" ? b.votes - a.votes || (a.createdAt < b.createdAt ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );

  return (
    <>
      <section className="panel">
        <h2>企画を出す</h2>
        <p className="muted">ログインは要りません。思いついたことをそのまま書いてください。</p>
        <textarea
          className="bin"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="例）ジョージアの市場で買った食材だけで一週間ごはん作る"
        />
        <div className="brow">
          <input
            className="bin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="名前（任意）"
          />
          <button className="bbtn" onClick={submit} disabled={sending}>
            {sending ? "送信中…" : "掲示板に貼る"}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </section>

      <section className="panel">
        <div className="bhead">
          <h2 style={{ margin: 0 }}>みんなの企画</h2>
          <div className="bsort">
            <button className={sort === "votes" ? "is-on" : ""} onClick={() => setSort("votes")}>
              人気順
            </button>
            <button className={sort === "new" ? "is-on" : ""} onClick={() => setSort("new")}>
              新着順
            </button>
          </div>
        </div>

        {ideas === null && <p className="muted">読み込み中…</p>}
        {ideas?.length === 0 && <p className="muted">まだ企画がありません。いちばんに出してみてください。</p>}

        <ul className="ideas">
          {list.map((i) => (
            <li key={i.id} className={i.status === "picked" ? "is-picked" : ""}>
              <button className={`vote${voted.has(i.id) ? " is-on" : ""}`} onClick={() => vote(i.id)} aria-label="いいね">
                <span aria-hidden>👍</span>
                <b>{i.votes}</b>
              </button>
              <div className="idea-body">
                <p>{i.text}</p>
                <div className="idea-meta">
                  {i.name && <span>{i.name} さん</span>}
                  <time>{i.createdAt.slice(0, 10).replace(/-/g, "/")}</time>
                  {i.status === "picked" && <em>採用されました</em>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
