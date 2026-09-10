"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getMyStickies,
  getNextPlans,
  loadMe,
  myPlans,
  type Me,
  type NextPlan,
  type Sticky,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import IslandMe from "@/components/live/IslandMe";
import MeHero from "./MeHero";
import MyStuff from "./MyStuff";
import { useCards, type PlanDays } from "@/components/cards/cards";
import SignIn from "@/components/live/SignIn";

/**
 * じぶんのこと。**ログインした人が、自分の島での立ち位置を見る1枚。**
 *
 * ## 何を置いて、何を置かないか
 *
 * 置くのは「あなたは誰で、島に何を置いてきたか」だけ。
 *   - 立ち位置（`MeHero`）… 顔・キャラクター・名前・いっしょにいた日数
 *   - じぶんのもの（`MyStuff`）… 付箋・企画・カードを札で切り替える
 *   - 島に名前を出すか（畳み）
 *   - 島から出る
 *
 * **運営の道具はここに置かない**（`/me/desk`）。旅の道具・付箋への返事・
 * 企画の段・投げ銭の紐付け・アラートボックスは、じぶんのことではなく
 * 島の手入れで、用事も開く回数も違う。同じ紙に積んだ結果、あやとの画面は
 * 390px 幅で 8,336px——スマホ10画面ぶん——になっていた。
 * あやとの言葉（2026-09-10）「整理されてなさすぎる。ux 悪すぎ。縦長すぎる」。
 *
 * ## 溜まっても背が変わらない形にする
 *
 * 付箋も企画もカードも、来てくれるほど増える。前は3つとも独立した紙で
 * 縦に積んであったので、**貼った人ほど下が遠くなる**面だった。
 * 札で切り替えて、同時に1つしか出さない（`MyStuff`）。
 */
export default function MyPage({ planDays }: { planDays: PlanDays }) {
  const { user, token, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  /** 取りにいっている最中は null。0枚と区別する */
  const [stickies, setStickies] = useState<Sticky[] | null>(null);
  const [plans, setPlans] = useState<NextPlan[] | null>(null);
  /** 読めなかったか。空っぽと読めなかったを、同じ顔で出さない */
  const [down, setDown] = useState(false);
  const { cards } = useCards();

  const load = useCallback(async () => {
    const t = await token();
    if (!t) return;
    setDown(false);
    try {
      const now = await loadMe(t);
      setMe(now);
    } catch {
      setDown(true);
    }
    try {
      const r = await getMyStickies(t);
      setStickies(r.notes);
    } catch {
      setStickies([]);
      setDown(true);
    }
    try {
      /* 企画は誰でも読める口から引いて、自分のぶんだけ手元で残す。
         「自分のぶんだけ」をサーバーに頼むと `where` と `orderBy` が
         組み合わさって複合索引が要る（#168）。 */
      const r = await getNextPlans(200);
      const mine = myPlans();
      setPlans(
        r.plans.filter((p) => (p.byUid ? p.byUid === user?.uid : mine.has(p.id))),
      );
    } catch {
      setPlans([]);
      setDown(true);
    }
  }, [token, user?.uid]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // ログインの状態が決まるまで。ここで「入っていません」と言うと、
  // 引き継ぎの終わった人に一瞬だけ嘘をつくことになる
  if (user === undefined) {
    return (
      <section className="panel paper">
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel paper">
        <h2>ここは、入った人のところ</h2>
        <p className="muted">島は、入らないままでも遊べます。</p>
        <SignIn />
      </section>
    );
  }

  /* 顔は**毎晩入れ直る `channelPhoto`**。ログインした日のまま止まる
     `user.photo` は使わない（`docs/island-misses.md` #1・#2）。 */
  const face = me?.channelPhoto || "";
  const mine = me?.channelId
    ? (cards ?? []).filter((c) => c.channelId === me.channelId)
    : [];

  return (
    <>
      <MeHero name={me?.nickname || user.name} face={face} channelId={me?.channelId} />

      {/* 島の手入れ（`/me/desk`）。**あやとだけ。じぶんのものより上。**
          旅の途中は、ここを開くために `/me` へ来る。 */}
      {me?.admin && (
        <Link className="mp-goto is-lead" href="/me/desk">
          <Icon name="signpost" size={22} />
          <span className="mp-goto-t">
            <b>島の手入れ</b>
            <i>写真・その日・いまどこ・配信・付箋・企画・投げ銭・OBS</i>
          </span>
          <Icon name="right" size={14} />
        </Link>
      )}

      <MyStuff
        stickies={stickies}
        plans={plans}
        cards={me?.channelId ? mine : null}
        planDays={planDays}
        uid={user.uid}
        hasChannel={!!me?.channelId}
      />

      {down && (
        <p className="muted mp-small">
          いくつか読めませんでした。電波の届くところで開き直すと出ます。
        </p>
      )}

      {/* 島での見え方。畳んでいいのは、決めたら滅多に触らないから。
          **見出しが中身を言っている**ので、畳んでいても探せる。 */}
      <Fold
        title="名前とアイコンを、島に出すか"
        lead={
          me
            ? me.showName || me.showPhoto
              ? "いまは出しています"
              : "いまは出していません"
            : undefined
        }
      >
        <IslandMe me={me} />
      </Fold>

      {/* ログアウトは畳まない。**畳みの向こうに置いたせいで見つからなかった**
          のが、ここへ移ってきた理由（#152・#163）。紙も見出しも要らない。
          押しどころが1つあれば、それが何をするかは字が言っている。 */}
      <div className="mp-out">
        <button className="mp-outbtn" onClick={signOut}>
          ログアウト
        </button>
      </div>
    </>
  );
}
