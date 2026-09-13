import Link from "next/link";

import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
import { StreamCard } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { chapterDays, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { shortsOf } from "@/content/shorts";
import ChapDays from "./ChapDays";
import IsleSpan from "./IsleSpan";
import { MarkList, ShortGrid } from "./IsleLists";
import { isleSpanNote } from "./span";
import { appsOf, legendsOf } from "./spec";
import { stayClosedOn } from "@/lib/stay";
import { charImg } from "@/lib/charImg";

/**
 * 島の下の紙 — **その章を、その島の中で振り返る。**
 *
 * あやとの言葉（2026-09-10）:
 *
 * > この島の画面の中身の本部の部分が一切なくて、2024年10月から2025年3月まで
 * > いた島だけになってて。さすがにこれは、デザインレベルが低すぎてて。
 * > **一番初めのデフォルトの島ぐらいのなんかリッチさにはしてほしい**なと
 * > 思ってます。そこからいろいろこうヨーロッパ周遊のことを振り返りたりとか
 * > できればいい
 *
 * > このコーカサス周遊の島は**ジョージアのこと**とか、この島で歩いた国とか、
 * > **この島でやったアプリ**のこととか、**この島でやった配信**のこととか、
 * > **この島でやった配信の企画**とかみたいなのを
 * > **アーカイブとして置いとかないといけない**
 *
 * ## 島は板、その下は紙
 *
 * トップと同じ形（`docs/island-world.md` 1.5）。島がまず画面いっぱいに出て、
 * 下に紙が続く。デフォルトの島の下に4章あるのと同じ役目を、ここでは
 * **その章のアーカイブ**が持つ。
 *
 * ## 段は、中身のあるものだけ出す
 *
 * 島に建つものと同じ決まり（`docs/island-atlas.md` 4章）。
 * **その章に無かったものの段は出さない。** アプリを1本も触っていない章に
 * 「この島で作っていたアプリ（0本）」を出すと、島が嘘をつく。
 * 空の段を「まだありません」で埋めるのは、無かった事実を隠すのと同じ。
 *
 * ## 溜まっても背が変わらない形にする
 *
 * `docs/island-standards.md` 7。コーカサスの配信は 440本ある。
 * 全部を縦に積むと、この面だけで 3万px になる。並びは `Longer` で畳んで、
 * **押せば最後まで出る**（上限で切らない）。
 */
export default function IsleReview({ chapter: c }: { chapter: Chapter }) {
  const days = chapterDays(c);
  const st = CHAPTER_STATS[c.slug];
  const countries = c.countries
    .map((s) => COUNTRIES.find((x) => x.slug === s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const legends = legendsOf(c);
  const apps = appsOf(c);
  /* 配信。**人の集まった順**に出す。新しい順にすると、440本のうち
     いちばん上に来るのが「移動します」のような短い1本になる */
  const streams = CHAPTER_STREAMS[c.slug] ?? [];
  const best = [...streams].sort((a, b) => b[3] - a[3]);
  const shorts = shortsOf(c.slug);

  /* まだ何も起きていない島（出発前の次の島）。**紙を出さない。**
     数字も国も配信も無いので、段が全部消えて罫線だけが残る */
  if (!st && !countries.length && !streams.length) return null;

  return (
    <Sheet>
      {st && (
        <Zone>
          {/* 「2025年6月 〜 いま」は、次の島へ出発した日に閉じる。焼いたままにすると、
              出発したあとも過去の島が「いま」と言い続ける（`./span.ts`） */}
          <H note={<IsleSpan chapter={c} kind="note" baked={isleSpanNote(c)} />}>この島のこと</H>
          <p className="isle-note">{c.note}。</p>
          <Rec
            items={[
              { n: <ChapDays chapter={c} baked={days} />, unit: "日", label: "この島にいた" },
              { n: st.streams.toLocaleString(), unit: "本", label: "配信した" },
              { n: st.people.toLocaleString(), unit: "人", label: "来てくれた" },
              { n: countries.length, unit: "カ国", label: "歩いた" },
            ]}
          />
        </Zone>
      )}

      {countries.length > 0 && (
        <Zone>
          <H note={`${countries.length}カ国`}>この島で歩いた国</H>
          <ul className="isle-kuni">
            {countries.map((k) => {
              const cities = k.stays.flatMap((s) => s.cities);
              return (
                <li key={k.slug}>
                  <Link href={`/map/${k.slug}`} prefetch={false}>
                    <Flag slug={k.slug} size={30} />
                    <span className="isle-kuni-body">
                      <b>{k.name}</b>
                      <i>{stayText(k.stays, stayClosedOn(k.slug))}</i>
                      <em>{cities.slice(0, 4).join("・")}</em>
                    </span>
                    <Icon name="right" size={14} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Zone>
      )}

      {legends.length > 0 && (
        <Zone>
          <H note={`${legends.length}つ`}>この島でやった企画</H>
          <ul className="isle-legends">
            {legends.map((l) => (
              <li key={l.slug}>
                <Link href={`/legends/${l.slug}`} prefetch={false}>
                  <img src={`/sprites/${l.icon}.webp`} alt="" width={64} height={64} loading="lazy" />
                  <span className="isle-legend-body">
                    <b>{l.title}</b>
                    <span className="isle-legend-fig">
                      <em>{l.figure.n}</em>
                      {l.figure.unit && <i>{l.figure.unit}</i>}
                      <span>{l.figure.cap}</span>
                    </span>
                    <span className="isle-legend-lead">{l.lead}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Zone>
      )}

      {apps.length > 0 && (
        <Zone>
          <H note={`${apps.length}本`}>この島で作っていたアプリ</H>
          <div className="isle-apps">
            {apps.map(({ app, marks }) => (
              <article className="isle-app" key={app.slug}>
                <Link className="isle-app-head" href={`/apps/${app.slug}`} prefetch={false}>
                  {app.logo ? (
                    <img src={app.logo} alt="" width={48} height={48} loading="lazy" />
                  ) : (
                    <img src={`/sprites/${app.icon}.webp`} alt="" width={48} height={48} loading="lazy" />
                  )}
                  <span>
                    <b>{app.name}</b>
                    <i>{app.tagline}</i>
                  </span>
                  <Icon name="right" size={14} />
                </Link>
                {/* この島にいたあいだの節目だけ。**アプリの年表ぜんぶではない** */}
                <MarkList marks={marks} />
              </article>
            ))}
          </div>
        </Zone>
      )}

      {streams.length > 0 && (
        <Zone>
          <H note={`${streams.length.toLocaleString()}本`}>この島でやった配信</H>
          <div className="scards">
            {best.slice(0, 4).map(([date, id, title]) => (
              <StreamCard key={id} videoId={id} title={title} date={date} />
            ))}
          </div>
          <Link className="isle-more" href={`/island/${c.slug}/streams`} prefetch={false}>
            <span>
              <b>この島の配信を全部見る</b>
              <i>{streams.length.toLocaleString()}本。この章のぶんだけ</i>
            </span>
            <Icon name="right" size={15} />
          </Link>
        </Zone>
      )}

      {shorts.length > 0 && (
        <Zone>
          <H note={`${shorts.length}本`}>この島のショート動画</H>
          <ShortGrid shorts={shorts} />
        </Zone>
      )}

      {st && st.residents.length > 0 && (
        <Zone>
          <H note={`${st.people.toLocaleString()}人`}>この島にいた人</H>
          <p className="isle-note">
            島を歩いているのが、この人たち。よく来てくれた人ほど、島にいる日が多い。
          </p>
          <ul className="isle-folks">
            {st.residents.map((r) => (
              <li key={r.icon}>
                <img
                  src={charImg(r.icon, 128)}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                />
                <i>{r.days}日</i>
              </li>
            ))}
          </ul>
          <Link className="isle-more" href="/friends" prefetch={false}>
            <span>
              <b>愉快な仲間達</b>
              <i>キャラクターは自分で作れる</i>
            </span>
            <Icon name="right" size={15} />
          </Link>
        </Zone>
      )}
    </Sheet>
  );
}

/**
 * 「2024年10月〜11月、2025年3月」。同じ国に何度も寄っている章があるので、区間ごとに出す。
 *
 * **年も月も、同じなら二度書かない。** 全部書くと「2024年12月〜2024年12月」に
 * なって、1行に収まらず途中で切れる（実測で国の半分がそうなっていた）。
 *
 * **終わりの空いている滞在を、そのまま割らない。** `s.to` が空だと
 * `Number(undefined)` になって、本番に **「2026年5月〜年NaN月」** が出ていた。
 * 島を出た日が分かっていればそこで閉じ（`lib/stay.ts` の `stayClosedOn`）、
 * まだその島にいるなら「から」で開けたままにする。
 *
 * @param closedOn その国を出た日（YYYY-MM-DD）。まだいるなら null
 */
function stayText(stays: { from: string; to: string }[], closedOn: string | null) {
  return stays
    .map((s) => {
      const [fy, fm] = s.from.split("-");
      const to = s.to || closedOn;
      if (!to) return `${fy}年${Number(fm)}月から`;
      const [ty, tm] = to.split("-");
      if (fy === ty && fm === tm) return `${fy}年${Number(fm)}月`;
      if (fy === ty) return `${fy}年${Number(fm)}〜${Number(tm)}月`;
      return `${fy}年${Number(fm)}月〜${ty}年${Number(tm)}月`;
    })
    .join("、");
}
