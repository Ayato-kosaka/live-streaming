"use client";

import { useState } from "react";
import { saveMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * 島での見え方の設定。
 *
 * 島に住んでいるのは視聴者さん本人のキャラクター。
 * ただ、名前と YouTube のアイコンを島に出すかどうかは、本人が決めることにしている。
 * 何もしなければ、キャラクターだけが島にいて、名前は出ない。
 *
 * **どの絵が誰のものかは、ここで選ばせない。** 割り当てはあやとが表で持っていて、
 * `content/residents.ts` の `channel` に焼いてある。本人に選ばせると、
 * 他人のキャラクターを自分のものにできてしまう。
 * ログインでできるのは「認可されたことをする」のと「書いたものに名前を刻む」ことで、
 * 島の住人の割り当てはその外にある。
 */
export default function IslandMe() {
  const { user, token } = useAuth();
  const [nickname, setNickname] = useState("");
  const [showName, setShowName] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  if (!user) return null;

  const save = async () => {
    const t = await token();
    if (!t) return setState("error");
    setState("saving");
    try {
      await saveMe({ nickname: nickname.trim() || null, showName, showPhoto }, t);
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="me">
      <b className="me-title">島での見え方</b>
      <p className="me-note">
        名前を出すことにすると、島にいるあなたのキャラクターの札に名前が出ます。
        出さないままでも、キャラクターは島にいます。
      </p>
      {/* 「いま島にいる人」も、この同意にそろえてある（`docs/island-here.md`）。
          いま見ているかどうかは、名前を出すより踏み込んだことなので、
          出さないと決めた人のぶんは、そもそも置きにいかない。
          ここで言っておかないと、名前を出した人が
          「見ているのが知られる」ことを知らないまま出すことになる。 */}
      <p className="me-note">
        どちらかを出すことにすると、あなたがサイトを開いているあいだ、
        島の上に丸いアイコンが出ます。いま見ているページの建物のそばに立ちます。
        どちらも出さないままなら、他の人には出ません。
      </p>

      <label className="me-row">
        <span>島に出す名前</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={user.name}
          maxLength={20}
        />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
        <span>名前を出す</span>
      </label>
      <label className="me-check">
        <input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} />
        <span>YouTubeのアイコンを出す</span>
      </label>

      {/* 決めたものがどう見えるか。設定だけ並べても、押した結果が想像できない。
          キャラクターの絵は出さない。**どの絵があなたか、こちらでは分からない**
          （割り当てはあやとの表にある）ので、出すと嘘の絵を見せることになる。
          出せるのは名札そのものだけ。 */}
      <div className="me-prev">
        <span className="me-prev-label">名札はこう出ます</span>
        <div className="me-prev-body">
          {showName ? (
            <span className="me-prev-tag">
              {showPhoto && user.photo && <img src={user.photo} alt="" />}
              {nickname.trim() || user.name}
            </span>
          ) : (
            <span className="me-prev-none">名札は出ません</span>
          )}
        </div>
      </div>

      <button className="me-save" onClick={save} disabled={state === "saving"}>
        {state === "saving" ? "保存しています…" : "これでいく"}
      </button>
      {state === "done" && <p className="me-ok">保存しました。島に反映されます。</p>}
      {state === "error" && <p className="err">保存できませんでした。もう一度ためしてみてください。</p>}
    </div>
  );
}
