"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/ui/Icon";
import PhotoPost from "@/components/nordic/PhotoPost";
import PlanVideos from "./PlanVideos";
import { TripPlace } from "./TripTools";
import { PlanCare, StickyCare, useWaiting } from "./OwnerCare";
import { ReadAgainPanel, WaitingPanel } from "./ReadAgain";
import Fold from "@/components/ui/Fold";
import { MAIN_TOOLS, OTHER_TOOLS, TOOLS, type ToolRow, type Tool } from "./tools";

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
/* 付箋の貼り先も、開いた札のぶんだけ降ろす。焼き込みの表と、足したぶんの
   両方を引くので、机を開いただけでは引かせない。 */
const NoteThemes = dynamic(() => import("./NoteThemes"), { ssr: false });

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
 * 道具を縦に積まない。札を押した1つだけを開く。積むと、残りは
 * 畳みの向こうへ行くか、指で送る距離になる。**どれも1タップで出る**のが
 * この形の要点で、それは前の「旅の道具」の4つの札（#163）と同じ決め。
 *
 * ## 棚は2段。下の段は畳んでおく
 *
 * あやと（2026-10-14）「『いまどこ』は…『その他』に格下げ。『OBS』も
 * ほぼ使わないのでその他に格下げ」。札が10枚あっても、旅の途中に押すのは
 * 上の8枚。どれがどちらの棚かは `./tools.ts` が1か所で持つ。
 *
 * ## 開き直したら、続きから
 *
 * ヒッチハイクの途中に開くので、**前に使っていた道具から始める。**
 * 毎晩そこで写真を貼るなら、次に開いたときも写真の欄が出ている。

 *
 * ## 残っている数は、道具の1行目にある
 *
 * 札には出さない。**札に数を出すには、開いていない道具のぶんまで先に
 * 引くことになる**（企画の「いま◯件」は一覧を丸ごと降ろさないと出ない）。
 * 開いた道具の1行目で言えば足りる。
 *
 * ### 付箋だけは、札にも出す（2026-10-13）
 *
 * あやとの言葉:
 *
 * > 島の手入れで、付箋の未返信数のバッジを出して欲しい
 *
 * 上の決まりの理由は「**先に引くのが重いから**」で、重くないなら当たらない。
 * 付箋の「まだ返していない」は、いま**数と id だけを返す1本**で出る
 * （`GET /stickies/waiting`。本文も名前も返らない）。前は一覧と自分のぶんの
 * 2本を引いて差し引く形だったので、札には出せなかった。
 *
 * **ほかの8つには付けない。** どれも一覧を丸ごと降ろさないと数が出ないし、
 * 9つ全部にバッジが付けば、どれが待っているのかは結局読めない。
 */
export default function Desk() {
  const { owner, meRead, reloadMe } = useAuth();
  const [tool, setTool] = useState<Tool>("photo");
  /* まだ返していない付箋の数。**机を開いた時点で1本だけ引く**ので、
     「付箋」を開かなくても札にバッジが出る。読めなかった日は null のまま
     ——0 を出すと「ぜんぶ返した」に見える（§15） */
  const waiting = useWaiting();

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST);
      if (v && TOOLS.some((t) => t.id === v)) setTool(v as Tool);
    } catch {
      /* 端末が localStorage を使えなくても、写真から始まるだけ */
    }
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

  /**
   * 札を1段ぶん描く。**上の棚と「その他」で同じものを2度書かない。**
   *
   * 札は3列。390px で1枚 114px あるので、いちばん長い「写真を貼る」も
   * 折れない（4列にすると 88px になって折れる）。
   */
  const shelf = (list: ToolRow[], label: string) => (
    <div className="mp-tabs is-3" role="tablist" aria-label={label}>
      {list.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tool === t.id}
          className={`mp-tab${tool === t.id ? " is-on" : ""}`}
          onClick={() => pick(t.id)}
        >
          <Icon name={t.icon} size={18} />
          <span className="mp-tab-l">{t.label}</span>
          {/* **待っている数だけ。0 と「読めなかった」は出さない。**
              0 のバッジは「片づいている」を言うための飾りで、
              読んで何も分からない数字になる（`island-design.md` 4章）。
              光らせない——厚みは札そのものが持っている合図なので、
              ここは平らな札を1枚重ねるだけにする（同 3章） */}
          {/* **読めなかった日を、0件と同じ顔にしない**（`docs/island-standards.md` §10）。
              札が消えるだけだと「ぜんぶ返した」に見える。読めていないあいだは
              「—」を出して、**数が分からないこと**を言う。0件のときだけ消す。 */}
          {t.id === "sticky" && waiting.n === null && (
            <span className="mp-tab-b is-unknown" title="いま数えられていません">
              —
            </span>
          )}
          {t.id === "sticky" && !!waiting.n && <span className="mp-tab-b">{waiting.n}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <section className="panel paper">
        <h2>道具</h2>
        {shelf(MAIN_TOOLS, "島の手入れの道具")}

        {/* その他（あやと 2026-10-14）。**畳んでおく。** いま開いている道具が
            こちらの棚なら開けておく——閉じたままだと、開いている札が
            どこにも見えない。 */}
        <Fold title="その他" open={OTHER_TOOLS.some((t) => t.id === tool)}>
          {shelf(OTHER_TOOLS, "そのほかの道具")}
        </Fold>

        {/* 開いていないものは、そもそも作らない。欄が同時に生きていると、
            下書きの復元が何本も同時に走る。 */}

        <div className="mp-tool-body">
          {tool === "photo" && <PhotoPost />}
          {tool === "place" && <TripPlace />}
          {tool === "video" && <PlanVideos />}
          {tool === "sticky" && <StickyCare waiting={waiting} />}
          {tool === "dest" && <NoteThemes />}
          {tool === "plan" && <PlanCare />}
          {tool === "donor" && <DonorLinks />}
          {tool === "chara" && <Characters />}
          {tool === "fund" && <FundDesk />}
          {tool === "obs" && <AlertBoxBox />}
        </div>
      </section>

      {/* 配信中に開く面。**道具の札には混ぜない。**
          あちらは「その日のうちに入れる」もので、こちらは別の端末で開く面。
          **島の遠隔操作はここから消した**（あやと 2026-10-14「使い物に
          ならなかった」）。面も部品も口も残していない。 */}
      <Link prefetch={false} className="mp-goto" href="/me/roulette">
        <Icon name="poll" size={22} />
        <span className="mp-goto-t">
          <b>ルーレット</b>
          <i>配信していない方の端末で開く</i>
        </span>
        <Icon name="right" size={14} />
      </Link>
    </>
  );
}
