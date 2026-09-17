"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESIDENTS } from "@/content/residents";
import { charFit } from "@/content/characterBox";
import { useResidentDaysState } from "@/lib/residentDays";
import { VOICES } from "@/content/chatter";
import { useResidentShow } from "@/lib/liveStats";
import { useCharacters } from "@/lib/characters";
import { saveFile, saveName } from "@/lib/saveFile";
import { charImg } from "@/lib/charImg";
import { createVillagers } from "@/components/island/villagers";
import { placeById } from "@/components/island/layout";
import Icon from "@/components/ui/IconCore";
import CardOne from "@/components/cards/CardOne";
import ReadAgain from "@/components/me/ReadAgain";
import { useCards, type PlanDays } from "@/components/cards/cards";
import { Pedestal } from "./art";

/**
 * 今日、島に出ている人。
 *
 * 顔ぶれは日替わりで、よく来てくれている人ほど島にいる日が多い
 * （`components/island/villagers.ts`）。**その選び方をここで写さない。**
 * 島と図鑑で別々に抽選すると、図鑑に「今日いる」と書いてある人が島にいない。
 * 島を作っているのと同じ関数を呼んで、同じ答えをもらう。
 *
 * 静的書き出しなので、今日が何日かはビルド時には決められない。
 * 画面が出てから数える（出るまでは誰にも印が付かない）。
 */
function useOnIslandToday(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const out = new Map<string, string>();
    for (const v of createVillagers(RESIDENTS)) {
      if (v.icon) out.set(v.icon, placeById(v.post).label);
    }
    setM(out);
  }, []);
  return m;
}

/**
 * 島を歩いている仲間の図鑑。
 *
 * ## なぜ一覧をやめて、見開き＋マスにしたか
 *
 * 前は 22人ぶんの札を2列で積んでいて、面の高さが 5,155px（6.1画面）あった。
 * それだけ縦を使っても、1人について言えていたのは**名前と日数だけ**で、
 * 「絵と名前の一覧」から出られていなかった。
 *
 * 本物の図鑑（`docs/ac-reference.md` 7章、いきもの図鑑のシーラカンスの面）は
 * **一覧と1枚を分けている。** 一覧は小さいマスをぎっしり並べるだけ。
 * 選んだ1匹だけが、絵が縦の半分を占める大きな紙になる。
 * この形にすると、何人いても縦は増えず、1人あたりの中身は増える。
 *
 * 題名の札は**絵の上**（実測。白い紙を少し傾けて貼ってある）。
 * 欄は罫で割って、見出しに蛍光ペンの帯を敷く。影は落とさない。
 *
 * ## 出るのは「絵のある人ぜんぶ」
 *
 * あやとの言葉（2026-09-11）:
 *
 * > /friends からダウンロードできるようにしてもらって大丈夫。
 * > 全員分を、キャラクター作成順に出せば良い。
 *
 * 前はここが**島に立つ22人だけ**だった。焼き込み（`content/residents.ts`）に
 * 載っているのがその22人しかいなかったため。**絵のある人はもっと多い**
 * （数は毎晩変わるので、ここに書かない）。
 * 図鑑を口（`GET /characters`）から引くようにして、全員を作った順に並べる。
 *
 * **絵はもうドライブから取らない。** Firebase Storage に移してあるので
 * （#284）、そちらの 128 / 640 を使う。ドライブのフォルダを畳んでも
 * 図鑑は欠けない。
 *
 * ## 欄は、**言い切れる人にだけ**出す
 *
 * 日数・セリフ・今日いるところは、全員ぶんが揃っていない。
 * 日数は数えられていない人がいる（#115）。今日いるところは、**その日に島を
 * 歩く人を抽選して決めている**ので、外れた人については何も言えない（#116）。
 *
 * **揃っていない人の欄を、それらしい言葉で埋めない。欄ごと出さない。**
 * 「0日」も「今日は出ていません」も、こちらの都合を相手のことにすり替えている。
 * 代わりの説明も置かない（中の話になる）。
 * 誰にでも出せるのは、絵と、絵を持ち帰る道と、もらったカード。
 *
 * **`res`（焼き込みの名簿に居るか）を守りの条件に使わない。** 名簿は22人から
 * 102人に増えていて、いまは「ほぼ全員が通る」条件になっている。
 * 出すか出さないかは、**その欄に入れる値そのものが在るか**で決める（#115 の5）。
 */
/**
 * 絵の役どころ。画面に出す名前と、落とすファイルに付ける名前。
 *
 * **ファイル名のほうは日本語にしない。** `<a download>` に日本語が1文字でも
 * 入っていると、Chrome は名前ごと捨てて `download`（拡張子なし）にする
 * （`lib/saveFile.ts` に実測）。番号だけは残るので、何枚か落としても
 * 混ざらない。
 */
const ROLES = [
  ["plain", "背景なし", "nobg"],
  ["scene", "背景あり", "bg"],
] as const;

export default function FriendsWall({ plans }: { plans: PlanDays }) {
  const show = useResidentShow();
  /* あやと島カード（#173）。あやとの言葉:「/friends で、持ってるカード
     リスト見れたら面白い」。**図鑑の1枚の中に入れる。**
     図鑑は「その人が誰か」を1枚にまとめる紙なので、その人のもらった
     カードもその紙の欄の1つ。一覧のマスの下に別の並びを足さない。

     **読めなかった日に、欄ごと消さない**（#34 #36 #43）。消すと「この人は
     まだもらっていない」と同じ絵になる。読めていないことを欄の中で言って、
     読み直す道を置く。 */
  const { cards, read: cardsRead, reload: reloadCards } = useCards();
  /* 図鑑に並ぶ人。**焼き込みではなく口から。** 旅のあいだにあやとが
     スマホから足した人も、焼き直しを待たずに出る（`lib/characters.ts`）。 */
  const { chars, read: charsRead, reload: reloadChars } = useCharacters();
  const here = useOnIslandToday();
  /* 一緒にいた日数（#91）。**読めているかも一緒に持つ**（#115） */
  const { days: liveDays, read: daysRead } = useResidentDaysState();
  const list = chars ?? [];
  const [at, setAt] = useState(0);
  // 送りで見開きが差し替わったとき、目が迷子にならないよう見出しへ焦点を戻す。
  // ただし最初に開いたときは動かさない（勝手にスクロールしない）。
  const first = useRef(true);
  const head = useRef<HTMLParagraphElement>(null);

  const say = useMemo(() => Object.fromEntries(VOICES.map((v) => [v.icon, v])), []);
  /* 島に立つ人だけが持っている中身（日数を引くチャンネル）。
     `residents.ts` の並びには依らない。**絵の id で引く。** */
  const onIsland = useMemo(
    () => new Map(RESIDENTS.filter((r) => r.icon).map((r) => [r.icon!, r])),
    [],
  );

  const r = list[at];
  const res = r ? onIsland.get(r.id) : undefined;
  const v = r ? say[r.id] : undefined;
  const name = r ? show.get(r.id)?.name : undefined;
  const spot = r ? here.get(r.id) : undefined;
  /* いっしょにいた日数。**数が無いことを「0日」と言わない**（#115）。
     数の出どころは2つあって、どちらも**全員ぶんは持っていない**。

     - `/state` の `residentDays` は**上位60人ぶんだけ**
       （`functions/src/islandApi.ts`）。ここに載らない人は「少ない」のではなく
       **この口からは分からない**
     - 焼き込みの `days` は**直近90日**の出席日数で、しかも
       **`channelId` が結べなかった人は数えようがないので 0 が入る**
       （`content/residents.ts` の頭に書いてある）

     つまり手元の `0` は、ほとんどが「0日だった」ではなく「**数えられていない**」。
     本番の102人で数えると50人がこれに当たる。**投げ銭をして絵を描いてもらった人が、
     自分の札を開いて最初に見るのがこの欄**なので、そこに「0日」と出すのは
     こちらの都合を相手のせいにしている。

     **0 と「無い」を分けられないなら、数を出さない。**
     欄ごと出さないのは `/me` と同じ倒しかた（`components/me/MeHero.tsx` の
     `days > 0 &&`）。`docs/island-standards.md` 10 が言う「読めていないことを
     値0と同じ絵にしない」を、いちばん静かに守れる形。
     **代わりの字も置かない**——「紐付けできていません」は中の話
     （`CLAUDE.md`「画面で、システムの仕様を説明しない」）。 */
  const liveN = res?.channel ? liveDays[res.channel] : undefined;
  const bakedN = res && res.days > 0 ? res.days : undefined;
  const days = liveN ?? bakedN;
  /* これから数が来るかもしれないのは、チャンネルが結べていて、まだ
     `/state` を読んでいる最中の人だけ。そこは骨を置いて場所を取る
     （`docs/island-design.md` 4章）。結べていない人には永久に来ないので、
     骨を置くと「待てば出る」という嘘になる。 */
  const daysWait = days === undefined && daysRead === "wait" && !!res?.channel;
  /* 開いている1人のカード。新しい順のまま渡ってくるので並べ直さない */
  const mine = (cards ?? []).filter((c) => c.icon === r?.id);
  /* **画面に出す絵は `charImg`（口ごしの短い名前）。名簿が持っている
     置き場の URL をそのまま使わない。** 島もカードも /me も口ごしなので、
     ここだけ別の道にすると、絵の出しかたが2通りになる。口ごしなら
     同じ生い立ちで、Hosting の手前にも乗る（実測 MISS → HIT）。

     **持ち帰るぶんだけは名簿の URL を使う。** 縮める前のものは png だったり
     jpeg だったりで、口の `-{幅}.webp` の形に収まらない。 */
  /* 持ち帰るのは**縮める前のもの**。無ければいちばん大きい焼き上がり */
  const take = (role: "plain" | "scene") => {
    const p = r?.[role];
    if (!p) return null;
    return p.full ?? p.sizes?.["640"] ?? p.sizes?.["256"] ?? null;
  };

  const go = (n: number) => {
    setAt((n + list.length) % list.length);
    if (!first.current) head.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    first.current = false;
  };

  /* 取りに行っている最中。**空の図鑑を出さない。** マスの形だけ置いて、
     何が来るのかは分かるようにする（`docs/island-standards.md` 10）。 */
  if (charsRead === "wait" && !r)
    return (
      <div className="rzk-grid is-wait" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <span className="rzk-cell is-wait" key={i} />
        ))}
      </div>
    );

  /* 読めなかった。**「まだ誰もいません」とは言わない**（#34 #36 #43）。 */
  if (!r && charsRead === "down")
    return <ReadAgain what="図鑑" onRetry={reloadChars} />;

  /* 読めた上での0人。**ここではじめて「まだ」と言ってよい。**
     いま95人いるので起きないはずだが、**起きないはずのことを
     「読めなかった」と読み替えない。** 逆に読み替えると、口が空を
     返している日に「電波のせい」に見えて、誰も直しに来なくなる。 */
  if (!r) return <p className="pap-note">まだ、誰の絵もありません。</p>;

  return (
    <>
      {/* 図鑑の1枚。絵が縦の半分以上を占めるのが本物の型（ac-reference 7章 4）。 */}
      <div className="rzk">
        <div className="rzk-page">
          {/* 題名の札は絵の上。テープで貼ったように少し傾ける。
              名前を出していない人は通し番号が題名になる。

              **絵文字は置かない。** その人の印（`emoji`）を札に乗せていたが、
              このサイトは UI にもコンテンツにも絵文字を1文字も置かない
              （`docs/island-design.md` 1章。例外はない）。
              顔の代わりは、すぐ下にその人の絵そのものがある。 */}
          <p className="rzk-tag" ref={head}>
            {name ?? `No.${at + 1}`}
          </p>

          <div className="rzk-art">
            <Pedestal w={150} />
            {/* 全員ぶんを先読みさせない。見開きに出ている1枚だけ取りに行く。
                640 なのは、ここが図鑑の主役だから。箱は 280px（PC 330px）
                あるので、dpr2 の画面でも引き伸ばさずに出せる。
                一覧のマスは 128px のまま。増えるのは開いている1枚だけ。 */}
            <img key={r.id} src={charImg(r.id, 640)} alt="" style={charFit(r.id, 0.94, true)} />
          </div>

          <dl className="rzk-fields">
            {/* 絵を持ち帰る。**誰の1枚でも落とせる。**

                あやとの言葉（2026-09-11）:「/friends からダウンロード
                できるようにしてもらって大丈夫」。前はドライブのフォルダへの
                行き先が面の下にあるだけで、**自分の絵にたどり着くのに
                97枚の中から探す**必要があった。図鑑で開いている人の絵を
                そのまま落とせるようにする。

                渡すのは**縮める前のもの**。アイコンにも印刷にも使えるように
                （`characters_migrate.py`「大きさは、こちらで焼く」）。 */}
            <div className="rzk-wide rzk-take">
              <dt>絵を持ち帰る</dt>
              <dd>
                <div className="rzk-gets">
                  {ROLES.map(([role, label, file]) => {
                    const url = take(role);
                    if (!url) return null;
                    return (
                      <button
                        type="button"
                        className="rzk-get"
                        key={role}
                        onClick={() =>
                          // 落ちた先で見分けが付く名前にする。名前は入れない
                          // （日本語だと Chrome が名前ごと捨てる。`saveFile.ts`）
                          saveFile(url, saveName(`ayato-island-${at + 1}-${file}`, url))
                        }
                      >
                        <Icon name="download" size={14} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <i>アイコンに使ってもらって大丈夫。</i>
              </dd>
            </div>

            {/* いっしょにいた日数（#91 #115）。**数が分かっている人にだけ出す。**
                分からない人に「0日」と出すと、こちらが数えられていないことを
                「来ていない」と言い切ることになる（上の `days` に理由）。 */}
            {(days !== undefined || daysWait) && (
              <div className="rzk-wide">
                <dt>いっしょにいた日数</dt>
                <dd>
                  {days === undefined ? (
                    <span className="rzk-days-wait" aria-hidden />
                  ) : (
                    <>
                      <b className="rzk-days">{days}</b>日
                    </>
                  )}
                </dd>
              </div>
            )}
            {/* 今日いるところ（#116）。**島を歩いている人にだけ出す。**
                この欄を決めているのは島を歩く人の抽選（`useOnIslandToday` →
                `createVillagers`）なので、ここで言えるのは「今日この人が島に
                立っているか」だけ。**その人が今日来たかどうかではない。**
                選ばれなかった人に「今日は出ていません」と出すと、こちらの
                抽選結果を、その人の不在にすり替えることになる。
                本番の102人で数えると90人がこれに当たっていた。

                **代わりの字も置かない。**「今日は島を歩く人に選ばれていません」は
                中の話（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。
                日数の欄（上）と同じ倒しかた。

                **「数えています」も置かない。** 抽選は画面が出た直後の
                `useEffect` で同期に決まるので、その字が読める時間は無い。
                読めない字のために場所を取ると、歩いていない人の札にだけ
                一瞬だけ欄が増えて、また消える。 */}
            {spot && (
              <div className="rzk-wide">
                <dt>今日いるところ</dt>
                <dd>
                  <span className="rzk-spot">
                    <Icon name="pin" size={13} />
                    {spot}のあたり
                  </span>
                </dd>
              </div>
            )}
            {/* もらったカード。**その人のぶんだけ。**
                絵で突き合わせる（`components/cards/cards.ts` が
                チャンネル→絵を引いている）ので、名前を出していない人でも
                自分の絵のカードは分かる。まだ配られていないあいだは、
                欄ごと出さない（0枚を並べても何も分からない）。

                **ただし「読めなかった」で消さない。** 配られていないのか
                届かなかったのかが、見ている人に区別できなくなる。 */}
            {cardsRead === "down" && (
              <div className="rzk-wide rzk-cards">
                <dt>もらったカード</dt>
                <dd>
                  <ReadAgain what="カード" onRetry={reloadCards} quiet />
                </dd>
              </div>
            )}
            {mine.length > 0 && (
              <div className="rzk-wide rzk-cards">
                <dt>もらったカード</dt>
                <dd>
                  <div className="akd-grid">
                    {/* 2枚まで。ここは図鑑の欄の1つで、カード置き場ではない。
                        残りは下の行き先から見る */}
                    {mine.slice(0, 2).map((c) => (
                      <CardOne key={c.id} card={c} plans={plans[c.day]} showName={false} />
                    ))}
                  </div>
                  <Link className="rz-cards-go" href="/cards">
                    あやと島カードを、ぜんぶ見る
                    <Icon name="right" size={13} />
                  </Link>
                </dd>
              </div>
            )}
            {v && (
              <>
                <div className="rzk-wide">
                  <dt>島で言うこと</dt>
                  <dd>
                    <ul className="rzk-lines">
                      {v.lines.slice(0, 2).map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>はじめての人に</dt>
                  <dd className="rzk-say">{v.greet.first}</dd>
                </div>
                <div>
                  <dt>久しぶりの人に</dt>
                  <dd className="rzk-say">{v.greet.back}</dd>
                </div>
              </>
            )}
          </dl>

          {/* 送り。詳細ページの `.pager` と同じ役なので、同じ向きの印を使う */}
          <nav className="rzk-pager" aria-label="図鑑を送る">
            <button type="button" onClick={() => go(at - 1)}>
              <Icon name="left" size={14} />
              まえの人
            </button>
            <span>
              <b>{at + 1}</b> / {list.length}
            </span>
            <button type="button" onClick={() => go(at + 1)}>
              つぎの人
              <Icon name="right" size={14} />
            </button>
          </nav>
        </div>

        {/* 一覧のマス。押すと上の1枚が差し替わる。
            選んでいるものは塗りを変えず、細い枠だけで示す（ac-reference 7章 6）。 */}
        <div className="rzk-grid" role="tablist" aria-label="島の住人">
          {list.map((x, i) => {
            const on = i === at;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={on}
                className={`rzk-cell${on ? " is-on" : ""}${here.get(x.id) ? " is-here" : ""}`}
                key={x.id}
                onClick={() => go(i)}
              >
                <span className="rzk-cell-no">{i + 1}</span>
                <img
                  src={charImg(x.id, 128)}
                  alt={`${i + 1}人目`}
                  loading="lazy"
                  style={charFit(x.id, 0.82)}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 島へ戻る道。図鑑で顔を覚えた人に会いに行けるのが、この面のいちばんの用事。 */}
      {here.size > 0 && (
        <p className="rz-today">
          <b>今日、島を歩いているのは{here.size}人。</b>
          近くまで行くと、向こうから話しかけてくる。
          <Link href="/">
            島へ会いに行く
            <Icon name="right" size={13} />
          </Link>
        </p>
      )}

      <p className="pap-note" style={{ marginTop: "var(--sp-3)" }}>
        いま{list.length}人ぶんの絵があります。
      </p>
    </>
  );
}
