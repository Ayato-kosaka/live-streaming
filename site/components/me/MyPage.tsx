"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getCards,
  getMyStickies,
  getNextPlans,
  myPlans,
  type NextPlan,
  type Sticky,
} from "@/lib/api";
import { useAuth, withRead } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import IslandMe from "@/components/live/IslandMe";
import MeHero from "./MeHero";
import MyStuff, { type Bag } from "./MyStuff";
import ReadAgain, { WaitingPanel } from "./ReadAgain";
import { TOOL_LINE } from "./tools";
import { withIcons, type PlanDays, type ShownCard } from "@/components/cards/cards";
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
  /* 自分が誰か（`me`）は島じゅうで1回だけ引く。読み直しも向こうが持っている
     （`lib/auth.tsx`）。ここで別に引くと、机と数字で答えが割れる。 */
  const { user, token, signOut, me, meRead, owner, reloadMe } = useAuth();
  /** 付箋と企画。**待っている・読めた・読めなかったの3つを別に持つ** */
  const [stickies, setStickies] = useState<Bag<Sticky>>({ st: "wait" });
  const [plans, setPlans] = useState<Bag<NextPlan>>({ st: "wait" });
  /* カードはここで引いて持つ。**この面は付箋・企画・カードを、札1つで
     まとめて読み直す**ので、3つとも同じ `Bag` に揃えておく。 */
  const [cards, setCards] = useState<Bag<ShownCard>>({ st: "wait" });

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      /* 合言葉が取れない＝ログインの道具そのものが降りてこなかった。
         これも「読めなかった」で、0枚ではない */
      setStickies({ st: "down" });
      setPlans({ st: "down" });
      setCards({ st: "down" });
      return;
    }
    try {
      const r = await withRead(getMyStickies(t));
      setStickies({ st: "ok", list: r.notes });
    } catch {
      setStickies({ st: "down" });
    }
    try {
      /* 企画は誰でも読める口から引いて、自分のぶんだけ手元で残す。
         「自分のぶんだけ」をサーバーに頼むと `where` と `orderBy` が
         組み合わさって複合索引が要る（#168）。 */
      const r = await withRead(getNextPlans(200));
      const mine = myPlans();
      setPlans({
        st: "ok",
        list: r.plans.filter((p) => (p.byUid ? p.byUid === user?.uid : mine.has(p.id))),
      });
    } catch {
      setPlans({ st: "down" });
    }
    try {
      const r = await withRead(getCards());
      setCards({ st: "ok", list: withIcons(r?.cards ?? []) });
    } catch {
      setCards({ st: "down" });
    }
  }, [token, user?.uid]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  /** 「もう一度よみこむ」。**この面が引くもの全部を、まとめて読み直す。** */
  const retry = useCallback(() => {
    setStickies({ st: "wait" });
    setPlans({ st: "wait" });
    setCards({ st: "wait" });
    reloadMe();
    load();
  }, [load, reloadMe]);

  // ログインの状態が決まるまで。ここで「入っていません」と言うと、
  // 引き継ぎの終わった人に一瞬だけ嘘をつくことになる
  if (user === undefined) return <WaitingPanel />;

  if (!user) {
    return (
      <section className="panel paper">
        <h2>ここは、入った人のところ</h2>
        <SignIn />
      </section>
    );
  }

  /* 顔は**毎晩入れ直る `channelPhoto`**。ログインした日のまま止まる
     `user.photo` は使わない（`docs/island-misses.md` #1・#2）。 */
  const face = me?.channelPhoto || "";

  /* 自分が誰かを読めていない。**このとき、下の3つもそろって落ちている。**
     押しどころつきの札はこの1枚だけにして、下は何が欠けているかだけ言う
     （同じボタンを縦に並べない）。 */
  const meDown = meRead === "down" && !me;

  /* カードは「自分のもの」なので、**自分のチャンネルが読めるまで数えない。**
     読めていないのに数えると、持っている人の画面が 0枚と言い切る。 */
  const myCards: Bag<ShownCard> =
    meRead === "down" && !me ? { st: "down" }
    : !me ? { st: "wait" }
    : !me.channelId ? { st: "ok", list: [] }
    : cards.st !== "ok" ? cards
    : { st: "ok", list: cards.list.filter((c) => c.channelId === me.channelId) };

  return (
    <>
      <MeHero name={me?.nickname || user.name} face={face} channelId={me?.channelId} />

      {/* 島の手入れ（`/me/desk`）。**あやとだけ。じぶんのものより上。**
          旅の途中は、ここを開くために `/me` へ来る。

          **`me` が読めたかではなく、`owner` で出す。** `me` が読めなかった
          だけで消していたころ、細い電波では入口がここから消えて、画面上に
          `/me/desk` へ行く道が1本も残らなかった（`island-standards.md` 10）。 */}
      {owner === "yes" && (
        <Link className="mp-goto is-lead" href="/me/desk">
          <Icon name="signpost" size={22} />
          <span className="mp-goto-t">
            <b>島の手入れ</b>
            <i>{TOOL_LINE}</i>
          </span>
          <Icon name="right" size={14} />
        </Link>
      )}

      {/* 自分が誰かを読めなかったとき。**「あやとではない」に倒さない。**
          押せば読み直せるので、開き直さなくていい。 */}
      {meDown && <ReadAgain what="じぶんのこと" onRetry={retry} />}

      <MyStuff
        stickies={stickies}
        plans={plans}
        cards={myCards}
        planDays={planDays}
        uid={user.uid}
        hasChannel={!!me?.channelId}
        onRetry={retry}
        quiet={meDown}
      />

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
        <IslandMe />
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
