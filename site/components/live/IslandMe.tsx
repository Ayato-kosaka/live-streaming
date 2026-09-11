"use client";

import { useEffect, useRef, useState } from "react";
import { saveMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReadAgain, { Waiting } from "@/components/me/ReadAgain";

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
 *
 * **いま入っている値から始める（#163）。** ここは前まで、開くたびに
 * 「名前を出す・アイコンを出す」の両方に印が付いた状態で始まっていた。
 * 出さないと決めた人が開いて、何も触らずに保存すると、決めたことが
 * ひっくり返る。設定は、いまどうなっているかを見せるところから始める。
 *
 * ## 読めなかった日に、決めたことを消さない（#34 #36 #43）
 *
 * その #163 の直しには穴が残っていた。ここは自分で `loadMe` を叩いていて、
 * **落ちても `finally` で `ready` を立てていた。** つまり電波が細い日は、
 *
 *   1. 「名前を出す」「アイコンを出す」が**両方オフの顔**で開き（本当は出す設定でも）
 *   2. そのまま触れて、
 *   3. 「これでいく」を押すと `POST /me` が3つとも上書きするので、
 *      **本人が出すと決めた設定が消える**
 *
 * 嘘をつくだけでなく、**押すとデータが壊れる**ところだった。直しかたは2つ。
 *
 * - **答えは島でひとつ**（#34）。`POST /me` は `AuthProvider` が1回だけ引いて
 *   配っているので、ここで別に叩かない。面ごとに叩くと、落ちたぶんだけ答えが割れる
 * - **一度も読めていないうちは、欄も押しどころも出さない。** 読めなかったことを
 *   言って、読み直す道だけ置く（`components/me/ReadAgain.tsx`）。
 *   **読めていない相手に、書ける口を開かない**（#36）
 *
 * 一度でも読めたあとは、そのあとの読み直しが落ちても欄は出したままにする。
 * 手元に出ている値は本物なので、そこで消すほうが害になる。
 */
export default function IslandMe() {
  const { user, token, me, meRead, reloadMe } = useAuth();
  const [nickname, setNickname] = useState("");
  const [showName, setShowName] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  /** 島の答えが一度でも届いたか。**届くまでは、欄も押しどころも出さない。** */
  const [got, setGot] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  /* 打ちかけを塗り戻さない。入れるのは、はじめて届いた1回だけ
     （保存したあとに `AuthProvider` が読み直しても、手元の字が勝つ）。 */
  const filled = useRef(false);

  useEffect(() => {
    if (!me || filled.current) return;
    filled.current = true;
    setNickname(me.nickname ?? "");
    setShowName(me.showName);
    setShowPhoto(me.showPhoto);
    setGot(true);
  }, [me]);

  if (!user) return null;

  /* まだ一度も読めていない。**「出していません」の顔で出さない。**
     読めなかったことを言って、読み直す道を置く。 */
  if (!got)
    return meRead === "down" ?
        <ReadAgain what="島での見え方" onRetry={reloadMe} /> :
        <Waiting />;

  const save = async () => {
    // 読めていないものは送らない（押しどころを出さないのと、同じことを押す側でも見る）
    if (!filled.current) return;
    const t = await token();
    if (!t) return setState("error");
    setState("saving");
    try {
      await saveMe({ nickname: nickname.trim() || null, showName, showPhoto }, t);
      setState("done");
      /* 配っているほうも入れ替える。畳みの見出し（「いまは出しています」）は
         あちらの答えを見ているので、ここで言い直さないと古いまま残る。 */
      reloadMe();
    } catch {
      setState("error");
    }
  };

  return (
    <div className="me">
      {/* 「名前を出すと札に出ます」は下の見本（`.me-prev`）が見せている。
          仕組みの言い足しは置かない（`docs/island-standards.md` 6章）。 */}
      {/* 「いま島にいる人」も、この同意にそろえてある（`docs/island-here.md`）。
          いま見ているかどうかは、名前を出すより踏み込んだことなので、
          出さないと決めた人のぶんは、そもそも置きにいかない。
          ここで言っておかないと、名前を出した人が
          「見ているのが知られる」ことを知らないまま出すことになる。 */}
      <p className="me-note">
        どちらかを出すと、島を開いているあいだ、いま見ているところに丸いアイコンが立ちます。
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
        <input
          type="checkbox"
          checked={showName}
          onChange={(e) => setShowName(e.target.checked)}
        />
        <span>名前を出す</span>
      </label>
      <label className="me-check">
        <input
          type="checkbox"
          checked={showPhoto}
          onChange={(e) => setShowPhoto(e.target.checked)}
        />
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
