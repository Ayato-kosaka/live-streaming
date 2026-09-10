"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { loadMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Icon, { type IconName } from "@/components/ui/Icon";
import PhotoPost from "@/components/nordic/PhotoPost";
import PlanVideos from "./PlanVideos";
import { TripPlace } from "./TripTools";
import { PlanCare, StickyCare } from "./OwnerCare";

/* 投げ銭の紐付けとアラートボックスは、開いた札のぶんだけ降ろす。
   どちらも一覧を丸ごと引くので、机を開いただけで3本引かせない。 */
const DonorLinks = dynamic(() => import("./DonorLinks"), { ssr: false });
const AlertBoxBox = dynamic(() => import("./AlertBoxBox"), { ssr: false });

type Tool = "photo" | "place" | "video" | "sticky" | "plan" | "donor" | "obs";

/** 机の上に出せる道具。**並び順は、旅のあいだに開く回数の多い順。**
    その日に起きたことを書く欄はここにあったが、外した（2026-09-10）。
    旅の最中は秘書に一言送って、そこから整えて焼く。 */
const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
  { id: "photo", label: "写真", icon: "photo" },
  { id: "place", label: "いまどこ", icon: "pin" },
  { id: "video", label: "配信", icon: "live" },
  { id: "sticky", label: "付箋", icon: "pinup" },
  { id: "plan", label: "企画", icon: "checklist" },
  { id: "donor", label: "投げ銭", icon: "coin" },
  { id: "obs", label: "OBS", icon: "screen" },
];

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
 * 7つを縦に積まない。札を押した1つだけを開く。積むと、下の6つは
 * 畳みの向こうへ行くか、指で送る距離になる。**どれも1タップで出る**のが
 * この形の要点で、それは前の「旅の道具」の4つの札（#163）と同じ決め。
 *
 * ## 開き直したら、続きから
 *
 * ヒッチハイクの途中に開くので、**前に使っていた道具から始める。**
 * 毎晩そこで写真を貼るなら、次に開いたときも写真の欄が出ている。
 *
 * ## 残っている数は、道具の1行目にある
 *
 * 札には出さない。**札に数を出すには、開いていない道具のぶんまで先に
 * 引くことになる**（付箋の「まだ返していない」は、一覧と自分のぶんの
 * 2本を引いて差し引かないと出ない）。開いた道具の1行目で言えば足りる。
 */
export default function Desk() {
  const { user, token } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tool, setTool] = useState<Tool>("photo");

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
     もう一度見ている。ここで見るのは、出すか出さないかだけ。 */
  useEffect(() => {
    if (!user) return setAdmin(user === null ? false : null);
    let gone = false;
    (async () => {
      const t = await token();
      if (!t || gone) return;
      try {
        const me = await loadMe(t);
        if (!gone) setAdmin(!!me.admin);
      } catch {
        if (!gone) setAdmin(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [user, token]);

  if (admin === null)
    return (
      <section className="panel paper">
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      </section>
    );

  if (!admin)
    return (
      <section className="panel paper">
        <h2>ここは、あやとの机</h2>
        <Link className="blank-go" href="/me">
          じぶんのことへ
          <Icon name="right" size={14} />
        </Link>
      </section>
    );

  return (
    <>
      <section className="panel paper">
        <h2>道具</h2>
        <div className="mp-tabs is-4" role="tablist" aria-label="島の手入れの道具">
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
            </button>
          ))}
        </div>

        {/* 開いていないものは、そもそも作らない。欄が同時に生きていると、
            下書きの復元が何本も同時に走る。 */}
        <div className="mp-tool-body">
          {tool === "photo" && <PhotoPost />}
          {tool === "place" && <TripPlace />}
          {tool === "video" && <PlanVideos />}
          {tool === "sticky" && <StickyCare />}
          {tool === "plan" && <PlanCare />}
          {tool === "donor" && <DonorLinks />}
          {tool === "obs" && <AlertBoxBox />}
        </div>
      </section>

      {/* 配信中に開く2つ。**道具の札には混ぜない。**
          あちらは「その日のうちに入れる」もので、こちらは別の端末で開く面。 */}
      <Link className="mp-goto" href="/me/roulette">
        <Icon name="poll" size={22} />
        <span className="mp-goto-t">
          <b>ルーレット</b>
          <i>配信していない方の端末で開く</i>
        </span>
        <Icon name="right" size={14} />
      </Link>
      <Link className="mp-goto" href="/me/remote">
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
