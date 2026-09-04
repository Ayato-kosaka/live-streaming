"use client";

import { useEffect, useState } from "react";
import { getIdeas, postIdea, rememberVote, voteIdea, votedLocally, type Idea } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignIn from "@/components/live/SignIn";

/**
 * 国ごとの企画募集。
 *
 * 「北欧行くならこれやって」を国ごとに受け取る。
 * 出す先は島の企画掲示板と同じ。ただし頭に国名の札を付けて貼るので、
 * その国のページには、その国あての提案だけが並ぶ。
 * こうしておくと、あやとが現地に着いた日に、その国ぶんだけ読み返せる。
 */
export default function CountryIdeas({ country }: { country: string }) {
  const tag = `【${country}】`;
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const { user, token } = useAuth();

  useEffect(() => {
    setVoted(votedLocally());
    getIdeas()
      .then((r) => setIdeas(r.ideas.filter((i) => i.text.startsWith(tag))))
      .catch(() => setIdeas([]));
  }, [tag]);

  const submit = async () => {
    const t = text.trim();
    if (t.length < 4) {
      setErr("もう少しだけ、くわしく書いてほしい");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { idea } = await postIdea(tag + t, name.trim() || undefined, await token());
      setIdeas((cur) => [idea, ...(cur ?? [])]);
      setText("");
    } catch (e) {
      setErr(String(e).includes("429") ? "今日はもう出しすぎ。また明日。" : "貼れませんでした。もう一度どうぞ。");
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

  const list = [...(ideas ?? [])].sort((a, b) => b.votes - a.votes);

  return (
    <section className="panel">
      <h2>{country}でこれやって</h2>
      <p className="muted">
        行く前に読みます。現地で「今これ見てる」って言えるのがいちばん嬉しいので、
        知ってることがあったら書いてください。
      </p>
      {!user && <SignIn compact />}
      <textarea
        className="bin"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`例）${country}の朝市に行ってほしい。地元の人しかいないやつ`}
        maxLength={180}
        rows={3}
      />
      {!user && (
        <input
          className="bin-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前（なくてもいい）"
          maxLength={20}
        />
      )}
      <button className="bpost" onClick={submit} disabled={sending}>
        {sending ? "貼っています…" : "はりだす"}
      </button>
      {err && <p className="err">{err}</p>}

      {list.length > 0 && (
        <ul className="cideas">
          {list.map((i) => (
            <li key={i.id}>
              <p>{i.text.slice(tag.length)}</p>
              <span className="cidea-foot">
                <i>{i.name || "名無しさん"}</i>
                <button
                  className={`cidea-vote${voted.has(i.id) ? " is-on" : ""}`}
                  onClick={() => vote(i.id)}
                  disabled={voted.has(i.id)}
                >
                  いいね {i.votes}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ideas !== null && list.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          まだ1件もありません。最初のひとつをどうぞ。
        </p>
      )}
    </section>
  );
}
