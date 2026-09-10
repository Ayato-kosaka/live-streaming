"use client";

import dynamic from "next/dynamic";
import { firstLetter } from "@/lib/firstLetter";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  PLAN_STATUS_NAME,
  canEditPlan,
  getMyStickies,
  getNextPlans,
  loadMe,
  myPlans,
  type Me,
  type NextPlan,
  type Sticky,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RESIDENTS } from "@/content/residents";
import { themeById } from "@/content/themes";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import IslandMe from "@/components/live/IslandMe";
import MyCards from "./MyCards";
import type { PlanDays } from "@/components/cards/cards";
import SignIn from "@/components/live/SignIn";
import { Pin } from "@/components/live/art";

/* あやとの道具は、あやとの画面でしか読み込まない。
   旅の道具は旅程表（`content/nordic.ts`・44KB）を連れてくるし、
   島の手入れは付箋と企画をまとめて引く。**島に来る人のほとんどには要らない。**
   `ssr: false` なのは、書き出しの HTML に入れても誰の役にも立たないから。 */
const TripTools = dynamic(() => import("./TripTools"), { ssr: false });
const OwnerCare = dynamic(() => import("./OwnerCare"), { ssr: false });
const AlertBoxBox = dynamic(() => import("./AlertBoxBox"), { ssr: false });
/* 投げ銭の紐付け（#190）。旅の途中に赤いメールが来たとき、片手で直す面。
   ここも `ssr: false`。中身は全部ログインした人のもので、焼けるものが無い。 */
const DonorLinks = dynamic(() => import("./DonorLinks"), { ssr: false });

/** キャラクターの絵は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/** 「2026-09-06T…」→「9月6日」。島の中の日付はいつもこの形。 */
const day = (iso: string) =>
  `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

/**
 * じぶんのこと。**ログインした人が、自分のものを見つけられる1か所。**
 *
 * ## なぜ要るのか
 *
 * 貼った付箋も、出した企画も、島での見え方も、ログアウトも、
 * いままで「島のどこか」にはあった。付箋は掲示板の新着に紛れ、
 * 見え方とログアウトは掲示板の折りたたみの中にいた（#152 で
 * 「見つからない」と報告されたのがそこ）。**自分のものだけを集めた面が
 * 無かった**ので、自分が何をしたのかを見返す道が無かった。
 *
 * ## 誰が入れるか
 *
 * ログインした人は全員（あやとの言葉・#163）。`canDraft`（認可ユーザー）は
 * 捨ててある。残っているのは `admin`（あやと）だけで、そこにだけ
 * 旅の道具と島の手入れが増える。
 *
 * ## 並び順
 *
 * **あやとの画面では、旅の道具がいちばん上に来る。** ヒッチハイクの
 * 途中に片手で開くのがその3つで、下に積むと畳みの向こうに行く。
 * ほかの人の画面では、貼った付箋がいちばん上。
 */
export default function MyPage({ planDays }: { planDays: PlanDays }) {
  const { user, token, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  /** 取りにいっている最中は null。0枚と区別する */
  const [stickies, setStickies] = useState<Sticky[] | null>(null);
  const [plans, setPlans] = useState<NextPlan[] | null>(null);
  /** 読めなかったか。空っぽと読めなかったを、同じ顔で出さない */
  const [down, setDown] = useState(false);

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
        <SignIn />
      </section>
    );
  }

  /* 島にいるじぶん（下の面に出るキャラクター）。**割り当てはあやとの表だけが
     決める**（`content/residents.ts` の channel。元はスプレッドシート）。 */
  const chara = me?.channelId
    ? RESIDENTS.find((r) => r.channel === me.channelId)
    : undefined;

  /* 見出しの隣に出す丸。**前はここに YouTube の顔写真を出していた。**

     顔写真の出どころは3つある。

     | どこから | いつのもの |
     | --- | --- |
     | `islandChannels.photo`（`me.channelPhoto`） | 毎晩入れ直る |
     | `islandUsers.photo`（`me.photo`） | ログインを押した日のまま止まる |
     | ログインの人（`user.photo`） | 同上。Google 側の写真 |

     **どれも使わない。** あやとの言葉（2026-09-09）「そのカラムは使わないで
     欲しい」「YouTubeのアイコンですよ？画面中部に出てるやつ」。

     一度は「毎晩入れ直る `channelPhoto` なら古くならない」と考えて、そこだけ
     残した。**それは間違いだった。** 本番の中身を見ると、3つとも同じ絵を
     指している。

       islandUsers.photo    …/GUqKfpGZZ-…=s88-c-k-c0x00ffffff-no-rj
       islandChannels.photo …/GUqKfpGZZ-…=s800-c-k-c0x00ffffff-no-rj

     **ファイルの id が同じで、大きさの指定だけが違う。** 毎晩入れ直っては
     いるが、入れ直る先が同じ YouTube の顔写真なので、あやとが「古い」と
     言っているその絵がそのまま出続ける。片方に寄せても何も変わらない。

     ここは名前の隣の小さな丸なので、**頭の1文字だけにする。** 島の
     キャラクターはすぐ下の「島にいる、じぶん」で 256px で出しているので、
     ここにも置くと同じ絵が1枚の面に2回出る。看板の右はし（`MeButton`）とは
     頭文字の取り方をそろえてある（`lib/firstLetter.ts`）。 */

  return (
    <>
      {/* いま入っている人。**押しどころではないので、平ら（紙）。** */}
      <div className="mp-who">
        <span className="mp-face mp-face-none" aria-hidden>
          {firstLetter(user.name)}
        </span>
        <span className="mp-who-t">
          <b>{me?.nickname || user.name}</b>
          <i>
            {me
              ? me.showName || me.showPhoto
                ? "島に名前を出しています"
                : "島には名前を出していません"
              : "島での見え方を読んでいます…"}
          </i>
        </span>
      </div>

      {/* あやとの道具。**旅の途中に片手で開くので、いちばん上。** */}
      {me?.admin && <TripTools />}
      {/* OBS に貼る URL。**貼り替えが終わるまでは、島の手入れより上。**
          鍵を書き出しから外した（#180）ので、貼り替えないと投げ銭の
          通知が来ない。旅に出ると机が無いので、9/11 までに済ませる。 */}
      {me?.admin && <AlertBoxBox />}
      {me?.admin && <OwnerCare />}
      {/* 紐付けは、毎朝の取り込みが赤くなった日にだけ開く。**島の手入れの下。**
          付箋も企画も毎日のものだが、これは新しい人が来た日だけの用事。 */}
      {me?.admin && <DonorLinks />}

      <section className="panel paper">
        <h2>貼った付箋</h2>
        {stickies === null ? (
          <div className="wait is-row" aria-hidden>
            <span />
            <span />
          </div>
        ) : stickies.length === 0 ? (
          <div className="blank">
            <b>まだ1枚も貼っていません</b>
            <p>
              思いついたことを1行だけ書くところです。むちゃな注文ほど、だいたい通ります。
            </p>
            <Link className="blank-go" href="/board">
              板に貼りにいく
              <Icon name="right" size={14} />
            </Link>
          </div>
        ) : (
          /* 4枚だけ出す。**貼った人ほど長くなる面**なので、溜まったぶんを
             そのまま縦に積まない（#225）。1枚が本文・札・返事の3段あるので、
             20枚で 3,200px（スマホ4画面ぶん）まで伸びていた。 */
          <Longer items={stickies} first={4} step={8} unit="枚" className="mp-notes">
            {(n, i) => {
              const th = themeById(n.theme);
              return (
                <li key={n.id}>
                  <Pin tone={["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"][i % 4]} />
                  <p className="mp-note-text">{n.text}</p>
                  {/* テーマと日付は札にしない。**枠と余白のぶんだけ背が伸びる**し、
                      押せない札が押しどころの隣に並ぶと、合図が濁る。 */}
                  <p className="mp-note-foot">
                    <span>{th?.name ?? n.theme}</span>
                    <span>{day(n.createdAt)}</span>
                    {n.hearts > 0 && (
                      <span className="mp-hearts">
                        <svg viewBox="0 0 24 22" aria-hidden>
                          <path
                            d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                            fill="currentColor"
                          />
                        </svg>
                        {n.hearts}
                      </span>
                    )}
                  </p>
                  {n.reply && (
                    <p className="mp-reply">
                      <b>あやとから</b>
                      {n.reply}
                    </p>
                  )}
                </li>
              );
            }}
          </Longer>
        )}
      </section>

      <section className="panel paper">
        <h2>出した企画</h2>
        {plans === null ? (
          <div className="wait is-row" aria-hidden>
            <span />
            <span />
          </div>
        ) : plans.length === 0 ? (
          <div className="blank">
            <b>まだ1つも出していません</b>
            <p>題ひとつで出せます。日にちも場所も写真も、あとから足せます。</p>
            <Link className="blank-go" href="/board">
              企画を出しにいく
              <Icon name="right" size={14} />
            </Link>
          </div>
        ) : (
          /* 企画は1件が2段（題と札）なので、付箋より多めに出せる。 */
          <Longer items={plans} first={5} step={10} unit="件" className="mp-plans">
            {(p) => {
              const edit = canEditPlan(p, user.uid, myPlans());
              return (
                <li key={p.id}>
                  <span className="mp-plan-t">
                    <b>{p.title || "（題なし）"}</b>
                    <i>
                      <span className="chip">{PLAN_STATUS_NAME[p.status]}</span>
                      <span className="chip">{day(p.createdAt)}</span>
                      {p.hearts > 0 && <span className="chip">さんせい {p.hearts}</span>}
                    </i>
                  </span>
                  {edit === "ok" && (
                    <Link className="mp-go" href={`/next/new?id=${p.id}`}>
                      そだてる
                      <Icon name="right" size={13} />
                    </Link>
                  )}
                </li>
              );
            }}
          </Longer>
        )}
      </section>

      <section className="panel paper">
        <h2>島にいる、じぶん</h2>
        {chara?.icon ? (
          <div className="mp-chara">
            <img src={drive(chara.icon, 256)} alt="島にいるあなたのキャラクター" />
            <p>この絵で島を歩いています。</p>
          </div>
        ) : (
          <div className="blank">
            <b>キャラクターは、まだありません</b>
            <p>100円から投げ銭してくれた人に、あやとが1人ずつ描いています。</p>
            <Link className="blank-go" href="/friends">
              住んでいる人を見る
              <Icon name="right" size={14} />
            </Link>
          </div>
        )}
      </section>

      {/* あやと島カード（#173）。#163 で置いた「じぶんの壁紙」の器が、
          ここに入れ替わった。**壁紙を作る道具ではなく、その日いてくれた印が
          勝手に積まれていく場所**（あやとの言い直し）。
          焼いた1枚を残す仕組みは要らなくなった。カードは焼かずに、
          写真と名簿から組み立てているので。 */}
      <section className="panel paper">
        <h2>あやと島カード</h2>
        <MyCards channelId={me?.channelId} plans={planDays} />
      </section>

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
          のが、ここへ移ってきた理由（#152・#163）。 */}
      <section className="panel paper mp-out">
        <h2>島から出る</h2>
        <p className="muted">出ても、貼った付箋と出した企画は残ります。</p>
        <button className="mp-outbtn" onClick={signOut}>
          ログアウト
        </button>
      </section>
    </>
  );
}
