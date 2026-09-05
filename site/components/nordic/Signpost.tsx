"use client";

import { useEffect, useState } from "react";
import { postIdea, rememberVote, voteIdea, votedLocally } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignIn from "@/components/live/SignIn";
import type { Leg } from "@/content/nordic";
import Fork from "./Fork";
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
 *
 * **席は、押すところから始まる。**
 * ここは長いあいだ「いきなり書く欄」だった。開いた区間カードの 456px のうち、
 * 半分以上が誰も触っていない入力欄で埋まっていて、
 * 文章を書かない人にできることが1つも無かった。いまは段が3つある。
 *
 *   1. わかれ道を押す … 決まっていない分かれ目に、1票（`Fork.tsx`）
 *   2. いいねを押す   … 誰かが立てた道しるべに
 *   3. 書いて立てる   … 押してから開く。書く人だけが開く
 *
 * 3 を畳んだのは場所のためだけではない。**押す段を上に置くため。**
 * 入口がいきなり作文だと、97%の人は自分の席が無いと読む。
 */
export default function Signpost({
  leg,
  seq,
  ask,
  fork,
  logged,
}: {
  leg: string;
  /** `ROUTE` の中での位置。もう越えた区間かどうかを、ここで見分ける */
  seq: number;
  ask: string;
  fork?: Leg["fork"];
  /** 起きたことが書かれた区間か */
  logged?: boolean;
}) {
  const tag = legTag(leg);
  const items = useLegIdeas(tag);
  const [open, setOpen] = useState(false);
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
      {/* わかれ道があるときは、そちらが席の問い。`ask` は書く欄の中へ降ろす。
          問いを2つ並べると、どちらも読まれない。 */}
      {fork ? <Fork leg={leg} seq={seq} fork={fork} logged={logged} /> : <p className="spost-ask">{ask}</p>}

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
      {/* 読み込み中は、場所だけ先に取る。中身の形をした薄い板を2枚置く。
          ぐるぐる回すものは使わない（島に回るものは無い。`docs/island-design.md` 4章）。 */}
      {items === null && (
        <div className="spost-wait" aria-hidden>
          <span />
          <span />
        </div>
      )}
      {/* 「0件」を失敗のように見せない。言葉は「まだ」ではなく「これから」
          （`docs/nordic-fund.md` 3章・`island-design.md` 4章）。
          次にすることは、すぐ下の板が言うので、ここでは言わない。 */}
      {items !== null && list.length === 0 && (
        <p className="spost-none">この区間の道しるべは、これから立ちます。</p>
      )}

      {/* 書く欄は、押してから開く。閉じているあいだも、ここに何ができるかは分かる。 */}
      {!open ? (
        <button className="bpost" onClick={() => setOpen(true)}>
          道しるべを立てる
        </button>
      ) : (
        <div className="spost-write">
          {/* わかれ道のある区間では、書くほうの問いをここで出す */}
          {fork && <p className="spost-ask">{ask}</p>}
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
            autoFocus
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
            {sending ? "立てています…" : "立てる"}
          </button>
          {err && <p className="err">{err}</p>}
        </div>
      )}
    </div>
  );
}
