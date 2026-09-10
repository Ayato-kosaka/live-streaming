"use client";

import { useEffect, useState } from "react";
import { loadMe, saveMe, type Me } from "@/lib/api";
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
 *
 * **いま入っている値から始める（#163）。** ここは前まで、開くたびに
 * 「名前を出す・アイコンを出す」の両方に印が付いた状態で始まっていた。
 * 出さないと決めた人が開いて、何も触らずに保存すると、決めたことが
 * ひっくり返る。設定は、いまどうなっているかを見せるところから始める。
 */
export default function IslandMe({ me }: { me?: Me | null }) {
  const { user, token } = useAuth();
  const [nickname, setNickname] = useState(me?.nickname ?? "");
  const [showName, setShowName] = useState(!!me?.showName);
  const [showPhoto, setShowPhoto] = useState(!!me?.showPhoto);
  /** いま入っている値が届くまでは、いじらせない。上書き事故を起こさないため */
  const [ready, setReady] = useState(!!me);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  /* 親から渡されなかったときは、自分で読む。掲示板の折りたたみから
     切り離したので、単体で置かれることもある。 */
  useEffect(() => {
    if (me) return;
    let gone = false;
    (async () => {
      const t = await token();
      if (!t || gone) return;
      try {
        const now = await loadMe(t);
        if (gone) return;
        setNickname(now.nickname ?? "");
        setShowName(now.showName);
        setShowPhoto(now.showPhoto);
      } catch {
        /* 読めなければ、出さない側から始める。勝手に出すよりは安全 */
      } finally {
        if (!gone) setReady(true);
      }
    })();
    return () => {
      gone = true;
    };
  }, [me, token]);

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
      {/* **1行だけ残す。** 「いま島にいる人」もこの同意にそろえてある
          （`docs/island-here.md`）ので、出すと決めた人には
          「開いているあいだ島に立つ」ことまで起きる。
          そこは仕組みの話ではなく**その人の身に起きること**なので、書く。
          仕組みの説明（何が条件で、何が出ないか）は書かない
          （`docs/island-misses.md` #7）。 */}
      <p className="me-note">
        どちらかを出すと、開いているあいだ、島の上にあなたが立ちます。
      </p>

      <label className="me-row">
        <span>島に出す名前</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={user.name}
          maxLength={20}
          disabled={!ready}
        />
      </label>
      <label className="me-check">
        <input
          type="checkbox"
          checked={showName}
          disabled={!ready}
          onChange={(e) => setShowName(e.target.checked)}
        />
        <span>名前を出す</span>
      </label>
      <label className="me-check">
        <input
          type="checkbox"
          checked={showPhoto}
          disabled={!ready}
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
              {/* 出すのは**毎晩入れ直る顔**（`channelPhoto`）。ログインした日
                  のまま止まる `photo` を出すと、名札の見本だけが古い顔になる
                  （`docs/island-misses.md` #1）。 */}
              {showPhoto && user.channelPhoto && (
                <img src={user.channelPhoto} alt="" />
              )}
              {nickname.trim() || user.name}
            </span>
          ) : (
            <span className="me-prev-none">名札は出ません</span>
          )}
        </div>
      </div>

      <button className="me-save" onClick={save} disabled={!ready || state === "saving"}>
        {state === "saving" ? "保存しています…" : "これでいく"}
      </button>
      {state === "done" && <p className="me-ok">保存しました。</p>}
      {state === "error" && <p className="err">保存できませんでした。もう一度ためしてみてください。</p>}
    </div>
  );
}
