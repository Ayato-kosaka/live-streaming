"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useAuth, withRead } from "@/lib/auth";
import { getUnansweredStickies } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import PhotoPost from "@/components/nordic/PhotoPost";
import PlanVideos from "./PlanVideos";
import { TripPlace } from "./TripTools";
import { PlanCare, StickyCare } from "./OwnerCare";
import { ReadAgainPanel, WaitingPanel } from "./ReadAgain";
import { TOOLS, type Tool } from "./tools";

/* 投げ銭の紐付けとアラートボックスは、開いた札のぶんだけ降ろす。
   どちらも一覧を丸ごと引くので、机を開いただけで3本引かせない。 */
const DonorLinks = dynamic(() => import("./DonorLinks"), { ssr: false });
const AlertBoxBox = dynamic(() => import("./AlertBoxBox"), { ssr: false });
/* キャラクターも同じ理由で、開いた札のぶんだけ降ろす。**こちらは
   97人ぶんの絵を引く**ので、机を開いただけで降ろすと重い。 */
const Characters = dynamic(() => import("./Characters"), { ssr: false });
/* 貯金箱も同じ。**台帳を3本（スパチャ・出費・目標）引く**ので、机を開いた
   だけで降ろさない（#292）。 */
const FundDesk = dynamic(() => import("./FundDesk"), { ssr: false });

/* 道具の並びは `./tools` が1か所で持つ。**ここで並べない。**
   `/me` の入口の添え書きが同じ並びを手で持っていて、道具を1つ外した日に
   札のほうだけ直った（「その日」が残り、「キャラ」が抜けていた）。 */

/** 前に開いていた道具。次に開いたとき、そこから続けられるように控える。 */
const LAST = "ayato-desk-tool";

/**
 * 島の手入れ。**あやとだけ。**
 *
 * ## なぜ「じぶんのこと」から出したか
 *
 * 旅の道具・付箋への返事・企画の段・投げ銭の紐付け・アラートボックス。
 * この5つが `/me` に縦に積んであって、あやとの画面は 390px 幅で 8,336px、
 * スマホ10画面ぶんあった。あやとの言葉（2026-09-10）
 * 「オーナーマイページ画面が整理されてなさすぎる。ux 悪すぎ。縦長すぎる」。
 *
 * じぶんのことは「自分が誰で、島に何を置いてきたか」を見る面で、こちらは
 * **島を手入れする机**。用事が違うものを同じ紙に積んだのが原因なので、
 * 面ごと分ける。
 *
 * ## 机の上には、いま使う道具が1つだけ出ている
 *
 * 9つを縦に積まない。札を押した1つだけを開く。積むと、下の8つは
 * 畳みの向こうへ行くか、指で送る距離になる。**どれも1タップで出る**のが
 * この形の要点で、それは前の「旅の道具」の4つの札（#163）と同じ決め。
 *
 * ## 開き直したら、続きから
 *
 * ヒッチハイクの途中に開くので、**前に使っていた道具から始める。**
 * 毎晩そこで写真を貼るなら、次に開いたときも写真の欄が出ている。

 *
 * ## 返していない付箋の数だけ、札に出す
 *
 * あやとの言葉（2026-10-13）「島の手入れで、付箋の未返信数のバッジを
 * 出して欲しい」。
 *
 * **札に数を出せなかったのは、画面では数えられなかったから。**
 * 「まだ返していない」は、あやと自身が貼ったぶんを外して数えるが、
 * 誰が貼ったかは公開の口が返さない——だから一覧と自分のぶんの2本を
 * 引いて差し引いていた。札のために、開いていない道具の中身まで先に
 * 引く形になる。
 *
 * いまは**口が数える**（`GET /stickies/unanswered?n=1`）。返るのは数ひとつ
 * なので、机を開いたときに1回聞けば足りる。
 *
 * **数を出すのはここだけ。** 他の8つは、開いた道具の1行目で言う
 * （一覧を引かないと数が出ないものばかりで、札のために9本引くことになる）。
 *
 * 付箋の道具を開いているあいだは、**そちらが数え直したものが札に乗る**
 * （返す・見た・しまうを押すたびに動く）。
 */
export default function Desk() {
  const { owner, meRead, reloadMe, token } = useAuth();
  const [tool, setTool] = useState<Tool>("photo");
  /** まだ返していない付箋の数。**読めるまでは null**（0枚と区別する） */
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST);
      if (v && TOOLS.some((t) => t.id === v)) setTool(v as Tool);
    } catch {
      /* 端末が localStorage を使えなくても、写真から始まるだけ */
    }
  }, []);

  /* 机を開いたら、札の数字を1回だけ聞く。**数ひとつしか返らない口**
     （`?n=1`）なので、付箋の道具を開いていなくても引いてよい。

     **落ちたら黙って 0 にしない**（`docs/island-standards.md` 10章）。
     読めていない札は「—」のままで、0枚のときは札から数字が消える——
     **「まだ分からない」と「ぜんぶ返した」が同じ絵にならない。** */
  useEffect(() => {
    if (owner !== "yes") return;
    let gone = false;
    (async () => {
      const t = await withRead(token()).catch(() => null);
      if (gone || !t) return;
      try {
        const r = await withRead(getUnansweredStickies(t, { countOnly: true }));
        if (!gone) setWaiting(r.n);
      } catch {
        /* 読めなかった。札は「—」のまま。付箋の道具を開けば読み直す */
      }
    })();
    return () => {
      gone = true;
    };
  }, [owner, token]);

  /* 付箋の道具が数え直したら、札もそれに合わせる。**同じ数を2か所で
     数えない**ので、押したそばから札が動く。 */
  const onWaiting = useCallback((n: number | null) => {
    if (n !== null) setWaiting(n);
  }, []);

  const pick = (id: Tool) => {
    setTool(id);
    try {
      localStorage.setItem(LAST, id);
    } catch {
      /* 控えられなくても、その場では開く */
    }
  };

  /* 手入れできるかは、口（`functions/src/islandApi.ts` の `ownerUid`）が
     もう一度見ている。ここで見るのは、出すか出さないかだけ。
     誰かは `useAuth()` が島じゅうで1回だけ引く（`lib/auth.tsx`）。

     **「読めなかった」を「あやとではない」に倒さない。** 倒していたころ、
     `POST /me` が1回返らないだけで、あやとの机が「ここは、あやとの机」の
     1枚になっていた。道具の札は0枚、高さ 934px。しかも二度と読み直さないので、
     画面を開き直すまで戻らなかった（`docs/island-standards.md` 10）。 */
  if (owner === "unknown")
    return meRead === "down" ?
        <ReadAgainPanel what="机" onRetry={reloadMe} /> :
        <WaitingPanel />;

  if (owner === "no")
    return (
      <section className="panel paper">
        <h2>ここは、あやとの机</h2>
        <Link prefetch={false} className="blank-go" href="/me">
          じぶんのことへ
          <Icon name="right" size={14} />
        </Link>
      </section>
    );

  return (
    <>
      <section className="panel paper">
        <h2>道具</h2>
        {/* **9つになったので3列にする。** 4列のままだと 4+4+1 で、
            3段目に札が1枚だけ残る。3列なら 3×3 でちょうど埋まるし、
            390px で1枚 114px あるので「スパチャ」の4文字も折れない。 */}
        <div className="mp-tabs is-3" role="tablist" aria-label="島の手入れの道具">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tool === t.id}
              className={`mp-tab${tool === t.id ? " is-on" : ""}`}
              onClick={() => pick(t.id)}
            >
              <Icon name={t.icon} size={18} />
              <span className="mp-tab-l">{t.label}</span>
              {/* 返していない付箋の数。**0枚なら出さない**——用事が無い
                  ときに数字が残っていると、札を押す理由に見える。
                  読めていないあいだは「—」（0枚と同じ顔にしない）。 */}
              {t.id === "sticky" && waiting !== 0 && (
                <span className="mp-tab-b">{waiting ?? "—"}</span>
              )}
            </button>
          ))}
        </div>

        {/* 開いていないものは、そもそも作らない。欄が同時に生きていると、
            下書きの復元が何本も同時に走る。 */}

        <div className="mp-tool-body">
          {tool === "photo" && <PhotoPost />}
          {tool === "place" && <TripPlace />}
          {tool === "video" && <PlanVideos />}
          {tool === "sticky" && <StickyCare onWaiting={onWaiting} />}
          {tool === "plan" && <PlanCare />}
          {tool === "donor" && <DonorLinks />}
          {tool === "chara" && <Characters />}
          {tool === "fund" && <FundDesk />}
          {tool === "obs" && <AlertBoxBox />}
        </div>
      </section>

      {/* 配信中に開く2つ。**道具の札には混ぜない。**
          あちらは「その日のうちに入れる」もので、こちらは別の端末で開く面。 */}
      <Link prefetch={false} className="mp-goto" href="/me/roulette">
        <Icon name="poll" size={22} />
        <span className="mp-goto-t">
          <b>ルーレット</b>
          <i>配信していない方の端末で開く</i>
        </span>
        <Icon name="right" size={14} />
      </Link>
      <Link prefetch={false} className="mp-goto" href="/me/remote">
        <Icon name="signpost" size={22} />
        <span className="mp-goto-t">
          <b>島の遠隔操作</b>
          <i>配信に映している島を、手元から動かす</i>
        </span>
        <Icon name="right" size={14} />
      </Link>
    </>
  );
}
