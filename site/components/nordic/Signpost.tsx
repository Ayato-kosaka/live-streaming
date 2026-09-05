"use client";

import { useEffect, useState } from "react";
import { postIdea, rememberVote, voteIdea, votedLocally } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignIn from "@/components/live/SignIn";
import { addIdea, bumpVote, legTag, useLegIdeas } from "./ideas";

/**
 * 区間ごとの道しるべ。
 *
 * 「この旅、どうなってほしい？」はページのいちばん下にあって、問いが大きすぎた。
 * 300km 車が来ない日の話、雨の中で立つ日の話まで下ろすと、書ける人が出てくる
 * （`docs/nordic-fund.md` 提案2）。
 *
 * 貼り先は島の企画掲示板と同じ `islandIdeas`。頭に `【区間:riga-tallinn】` の札を
 * 付けて貼るので、サーバもコレクションも足していない。
 * あやとは現地に着いた日に、その区間ぶんだけ読み返せる。
 *
 * 読み込みは `ideas.ts` が1回だけまとめてやる。10区間ぶん別々に叩かない。
 * 貼ったものもそこへ返す。同じ区間の「つながった」の表示が、同じ画面にいるので
 * （`Carry.tsx` の `Tie`）、自分の欄だけが増えて、つながりが変わらないのはおかしい。
 */
export default function Signpost({ leg, ask }: { leg: string; ask: string }) {
  const tag = legTag(leg);
  const items = useLegIdeas(tag);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const { user, token } = useAuth();

  useEffect(() => {
    setVoted(votedLocally());
  }, []);

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
      addIdea(idea);
      setText("");
    } catch (e) {
      setErr(String(e).includes("429") ? "今日はもう出しすぎ。また明日。" : "貼れませんでした。もう一度どうぞ。");
    } finally {
      setSending(false);
    }
  };

  const vote = async (id: string) => {
    if (voted.has(id)) return;
    bumpVote(id);
    rememberVote(id);
    setVoted(new Set([...voted, id]));
    try {
      await voteIdea(id, await token());
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const list = [...(items ?? [])].sort((a, b) => b.votes - a.votes);

  return (
    <div className="spost">
      <p className="spost-ask">{ask}</p>

      {list.length > 0 && (
        <ul className="spost-list">
          {list.map((i) => (
            <li key={i.id}>
              <p>{i.text.slice(tag.length)}</p>
              <span className="spost-foot">
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
      {/* 「0件」を失敗のように見せない。言葉は「まだ」ではなく「これから」
          （`docs/nordic-fund.md` 3章）。 */}
      {items !== null && list.length === 0 && (
        <p className="spost-none">この区間の道しるべは、これから立ちます。最初のひとつをどうぞ。</p>
      )}

      {!user && <SignIn compact />}
      {/* 字数は 160 まで。サーバの上限が 200 字で、頭に区間の札
          （`【区間:helsinki-stockholm】` で23字）が付くため。 */}
      <textarea
        className="bin"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例）雨の日にどうやって立つのか、そのまま撮ってほしい"
        maxLength={160}
        rows={2}
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
        {sending ? "立てています…" : "道しるべを立てる"}
      </button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
