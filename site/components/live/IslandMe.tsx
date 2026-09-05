"use client";

import { useState } from "react";
import { RESIDENTS } from "@/content/residents";
import { saveMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * 島での見え方の設定。
 *
 * 島に住んでいるのは視聴者さん本人のキャラクター。
 * ただ、名前と YouTube のアイコンを島に出すかどうかは、本人が決めることにしている。
 * 何もしなければ、キャラクターだけが島にいて、名前は出ない。
 *
 * 自分のキャラクターは自分がいちばんよく知っているので、
 * 島にいる絵の中から選んでもらう（Drive の ID を入力させたりはしない）。
 */
export default function IslandMe() {
  const { user, token } = useAuth();
  const [pick, setPick] = useState<string | null>(null);
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
      await saveMe(
        { character: pick, nickname: nickname.trim() || null, showName, showPhoto },
        t,
      );
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="me">
      <b className="me-title">島での見え方</b>
      <p className="me-note">
        島にいる自分のキャラクターを選ぶと、名前とアイコンを出せるようになります。
        選ばなければ、いままでどおり名前は出ません。
      </p>

      <span className="me-label">自分のキャラクター</span>
      <div className="me-picks">
        <button
          className={`me-pick me-pick-none${pick === null ? " is-on" : ""}`}
          onClick={() => setPick(null)}
        >
          出さない
        </button>
        {RESIDENTS.filter((r) => r.icon).map((r) => (
          <button
            key={r.icon}
            className={`me-pick${pick === r.icon ? " is-on" : ""}`}
            onClick={() => setPick(r.icon!)}
            aria-label="このキャラクターが自分"
          >
            <img src={`https://lh3.googleusercontent.com/d/${r.icon}=s96`} alt="" loading="lazy" />
          </button>
        ))}
      </div>

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

      {/* 決めたものが島でどう見えるか。
          設定だけ並べても、押した結果が想像できない。出る形をそのまま見せる。 */}
      <div className="me-prev">
        <span className="me-prev-label">島でこう見えます</span>
        <div className="me-prev-body">
          {pick ? (
            <img className="me-prev-char" src={`https://lh3.googleusercontent.com/d/${pick}=s160`} alt="" />
          ) : (
            <span className="me-prev-none">キャラクターは出ません</span>
          )}
          {pick && showName && (
            <span className="me-prev-tag">
              {showPhoto && user.photo && <img src={user.photo} alt="" />}
              {nickname.trim() || user.name}
            </span>
          )}
          {pick && !showName && <span className="me-prev-none">名札は出ません</span>}
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
