"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui/PageShell";
import { Stat } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import WorldRoute from "@/components/atlas/WorldRoute";
import { stayClosedOn, stayNow, stayWord, travelNow, tripDayWord, type StayNow, type TravelNow } from "@/lib/stay";
import { chapterNow, tripDate } from "@/content/chapters";
import { countryNameBySlug } from "@/content/countries";
import { STAYS } from "@/content/stays";
import { BUILT_AT } from "@/lib/builtAt";
import { NOT_YET, useToday } from "@/lib/useToday";
import { tripPageOf } from "@/content/trip";

/**
 * 「歩いた国」のうち、**いまどこにいるか**を言っているところ。
 *
 * この面は静的書き出し（`output: "export"`）なので、ビルドした日の答えが
 * HTML に焼かれる。「いま」と書いてあるものを焼くと、その日から嘘になる。
 * 旅に出た1週間後の本番が、前置きで「いまはコーカサスにいます」と言い、
 * 札で「滞在 126日目」と数え、年表のジョージアに「いまここ」を付けていた。
 *
 * **焼いた字をまず出して、画面が出てから引き直す**（`components/atlas/Days.tsx`
 * と同じ形）。旅に出る前は、引き直しても同じ字になる。
 */

/** 前置きのうち、動かないところ。旅がどこまで進んでも本当のこと。 */
const LEAD =
  "2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、";

/**
 * その日までに入った、いちばん新しい国の名前（滞在の表の、着いた日がいちばん新しい行）。
 *
 * 前はここに国の地方（`region`。「コーカサス」）を渡していた。地域は種類ではない（`docs/spec/model.md` M-5）ので、
 * 国の名前で言う。歩き終わった国の表（`COUNTRIES`）からではなく滞在の表から引くのは、いま歩いている国
 * （記録をまだ持たない国）まで言うため。
 */
const lastCountry = (now: Date): string => {
  const day = tripDate(now);
  const s = [...STAYS].filter((x) => x.from <= day).sort((a, b) => a.from.localeCompare(b.from)).at(-1);
  return s ? (countryNameBySlug(s.country)?.name ?? s.name ?? "") : "";
};

/** 面の頭。**最後の1文だけが「いま」を言う。** */
export function MapHead() {
  /* 最初の描画は**焼いた時刻**で引く（`docs/island-misses.md` #30）。
     引数なしで呼ぶと、焼いた HTML とブラウザの最初の描画で答えが変わる。 */
  const [trip, setTrip] = useState<TravelNow | null>(() => travelNow(BUILT_AT));
  /* **「いまどこ」を名乗れない日がある。** 旅から帰って、次の島がまだ始まって
     いない日がそれ。前はそこで「いまはコーカサスにいます」に落ちていて、
     もう居ない国を「いま」と言っていた（`docs/island-misses.md` #24 と同じ形）。
     言えない日は、言わない。 */
  const [stay, setStay] = useState<StayNow | null>(() => stayNow(BUILT_AT));
  /* **旅の名前から、その旅の面へ送る。** ここは「いまは北欧周遊のとちゅうです」と
     書きながら、そこへ行く道を1本も持っていなかった。名前を出しておいて
     行けないのは、書いていないより悪い（`docs/island-misses.md` #12）。
     旅の面を持たない章もあるので、無ければ字のまま出す。
     **この字が出ているあいだは、旅が終わっていても押せる。** 名前と行き先を
     別の条件で出しわけると、名前だけ残って行けない日がまた来る。 */
  const [dest, setDest] = useState<string | null>(() => tripPageOf(travelNow(BUILT_AT)?.slug));
  const [region, setRegion] = useState(() => lastCountry(BUILT_AT));
  useEffect(() => {
    const now = new Date();
    setTrip(travelNow(now));
    setStay(stayNow(now));
    setDest(tripPageOf(travelNow(now)?.slug));
    setRegion(lastCountry(now));
  }, []);
  const lead = trip ? (
    <>
      {LEAD}
      {region}まで来ました。いまは
      {dest ? (
        <Link prefetch={false} className="phead-go" href={dest}>
          {trip.name}
        </Link>
      ) : (
        trip.name
      )}
      のとちゅうです。
    </>
  ) : stay ? (
    `${LEAD}いまは${stay.name}にいます。`
  ) : (
    // 旅にも出ていないし、いる国も引けない日。**「いま」を名乗らない**
    `${LEAD}${region}まで来ました。`
  );
  return <PageHead icon="signpost-flags" title="歩いた国" lead={lead} />;
}

/**
 * 4つめの札。**いまどこにいて、そこで何日目か。**
 *
 * 国の名前は数ヶ月変わらないので、添え字を日数にして
 * 「旅が止まっていない」がここに出るようにしてある（`docs/island-play.md` 仕掛け10）。
 * 旅に出たら、まだ `content/countries.ts` に無い国を歩いているので、
 * 国ではなく旅そのものを出す。
 */
export function HereStat({ slug, name }: { slug: string; name: string }) {
  /* **段（旅か・国か）は焼いた日で決めてよいが、日数は焼かない**（#339）。
     札がどちらの形かは、画面が出るまで焼いた日（`BUILT_AT`）の答えで出し、
     「◯日目」だけを今日が分かってから入れる。焼いた日の日数は、焼いた日の
     うちしか本当でない——焼いてから日付をまたいだ晩に、JS が動く前の札が
     「旅に出て 53日目」のまま残って、重い見張りが赤くなった。
     引き直しは `useToday` の刻み（1分）に乗せる。開きっぱなしの面が
     日付をまたいでも、札が前の日のまま残らない。 */
  const today = useToday();
  const at = today ?? BUILT_AT;
  const trip = travelNow(at);
  const stay = stayNow(at);
  /** その国を出た日。旅から帰って、次の島がまだ始まっていない日に出す */
  const left = stayClosedOn(slug, at);

  if (trip)
    return (
      <Stat
        /* **印を `<svg>` に入れて渡す。** この札だけ桃色に敷かれるのは
           「数ではなく、いま」の印で、その出しわけが `.stat:has(svg)`
           （`app/css/pages.css`）。旗のかわりに絵を置くと札の色が落ちて、
           4つのうちどれが「いま」なのか言えなくなる。
           枠は旗のために引いてある線なので、絵には引かない。 */
        value={
          <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden style={{ border: 0 }}>
            <image href="/sprites/tent.webp" width="36" height="36" />
          </svg>
        }
        label={trip.name}
        /* 字は `lib/stay.ts` の `tripDayWord` から（`/now` の帯と同じ字）。
           ここだけ自分で組んでいたので、出発の日に `/now` が「旅に出た日」、
           ここが「旅に出て 0日目」と言うところだった */
        sub={today ? tripDayWord(trip.days) : NOT_YET}
      />
    );
  return (
    <Stat
      value={<Flag slug={slug} size={34} />}
      label={name}
      /* **その国にいない日は「いまここ」と書かない。** 旅から帰って次の島が
         まだ始まっていない日は、出た日を出す。数えられない日だけ黙る */
      sub={
        stay
          ? today
            ? `滞在 ${stay.days.toLocaleString()}日目`
            : NOT_YET
          : left
            ? `${left.replace(/-/g, "/")} まで`
            : "いまここ"
      }
    />
  );
}

/**
 * パスポートの「出国」。**まだ書き入れられていないだけの空欄を、「まだ、いる」にしない。**
 *
 * 出国の日は旅から帰ったあやとが手で入れる欄だが、旅の17日間は入らない。
 * そのあいだ、もう出た国のページが「出国：まだ、いる」と言い続ける。
 * 次の島へ渡った日が、そのまま出国の日（`lib/stay.ts` の `stayClosedOn`）。
 */
export function StayOut({ slug }: { slug: string }) {
  /* 焼いた HTML に出る1回目も、**焼いた日**で引く（`lib/builtAt.ts`）。
     ここは問答無用で「まだ、いる」から始めていたので、**もう出た国の
     パスポートにも、焼いた HTML には必ず「まだ、いる」が入っていた。**
     JS の動かない読み手——OGP・検索の下見——には、それしか見えない */
  const [out, setOut] = useState<string | null>(() => stayClosedOn(slug, BUILT_AT));
  useEffect(() => setOut(stayClosedOn(slug, new Date())), [slug]);
  return <>{out ? out.replace(/-/g, "/") : "まだ、いる"}</>;
}

/**
 * その国にいた日数。**出国したら、そこで止まる。**
 *
 * 数えかたは `components/atlas/Days.tsx` と同じ（入った日は0日目）。
 * この面のほかの日数——終わった滞在ぶん（`closedDays`）——がその数えかたなので、
 * 足し合わせるこちらだけ1日目から数えると、合計が1日ずれる。
 *
 * @param plus 終わった滞在ぶんの日数
 */
export function StayLen({ slug, from, plus }: { slug: string; from: string; plus: number }) {
  const today = useToday();
  /* 出国済みならそこで止める。**日数にマイナスは無い**——先の日付から始まる
     国を足したとき、開発サーバで `BUILT_AT` が1970年になるとき（`Days.tsx`）。 */
  const count = (now: Date) => {
    const out = stayClosedOn(slug, now);
    const end = out ? Date.parse(`${out}T00:00:00Z`) : now.getTime();
    return Math.max(0, Math.floor((end - new Date(from).getTime()) / 86400000) + plus);
  };
  /* **まだいる国の日数は、今日が分かるまで出さない**（#339）。焼いた日の
     日数は、焼いた日のうちしか本当でない。
     焼いた日にもう出国していれば、数はそこで止まっていて、どの日に読んでも
     同じなので焼いてよい（JS を読まない読み手にも、終わった滞在の長さは残る）。
     前はここに日付を直に書いた `new Date` が置いてあって、その日より後に
     入った国は必ずマイナスになった——本番の `/map/sweden`（いまの
     `/travel/sweden`）が「いた日数 -15」を焼いていた（#5 #6）。 */
  if (!today && !stayClosedOn(slug, BUILT_AT)) return <>{NOT_YET}</>;
  return <>{count(today ?? BUILT_AT).toLocaleString()}</>;
}

/**
 * 滞在の長さの、ざっくりした言い方（「1週間ほど」）。**まだ続いている滞在のためのもの。**
 *
 * 国の面の一言（「ソフィアに来て、1週間ほど。」）に入る。焼いたままだと、出した日の長さで止まるので、
 * `StayLen` と同じく画面が出てから数え直す。出国したら、そこで止まる。
 * 最初の描画は焼いた日（`BUILT_AT`）で引く（`docs/island-misses.md` #30）。
 */
export function StayAbout({ slug, from }: { slug: string; from: string }) {
  const count = (now: Date) => {
    const out = stayClosedOn(slug, now);
    const end = out ? Date.parse(`${out}T00:00:00Z`) : now.getTime();
    return Math.max(0, Math.floor((end - new Date(from).getTime()) / 86400000));
  };
  const [n, setN] = useState(() => count(BUILT_AT));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setN(count(new Date())), [slug, from]);
  return <>{stayWord(n, true)}</>;
}

/**
 * 世界地図。**「いまここ」の輪と、名札を別のものにする。**
 *
 * 輪（`is-here`）は「この国にいる」と言う印なので、旅に出て、この地図に無い国を
 * 歩いているあいだは**どこにも出さない。** 本番では、北欧を歩いている日に
 * コーカサスの群れが桃色に脈打っていた。
 *
 * 名札（`is-named`）のほうは残す。世界ぜんぶの引きでは名前を1つしか置けないので、
 * 消すと地図から国名が1つも消える。指しているのは「いちばん新しく歩いた国」で、
 * これは日付で動かない。
 */
export function HereRoute({ slug }: { slug: string }) {
  /* **最初の描画も、焼いた時刻で引く**（`docs/island-misses.md` #30）。
     ここは渡された国をそのまま輪にして始めていたので、**焼いた HTML には
     必ずコーカサスの桃色の輪が入っていた。** 開いた瞬間に消えるとはいえ、
     消えるまでのあいだ、北欧を走っている晩の地図がジョージアで脈打つ。 */
  const [ring, setRing] = useState(() => stayNow(BUILT_AT)?.slug ?? "");
  useEffect(() => setRing(stayNow(new Date())?.slug ?? ""), []);
  return <WorldRoute here={ring} focus={slug} />;
}


/** 束の中の国1つ（組み立ては `./page.tsx`。滞在の行から） */
export type TripRow = {
  slug: string;
  name: string;
  /** 英字の国名。**記録を持たない国には無い**（無いものを埋めない） */
  en?: string;
  /** その旅の中の滞在（着いた順）。先の日付の滞在も入っている（出すかどうかは今日と見比べて決める） */
  stays: { from: string; to: string }[];
  /** 行った街。分からない国では空 */
  towns: string[];
  /** その国の面。**持たない国もある**ので、無ければ空（押せない札にする） */
  href: string;
};

/** 旅ひとつの束 */
export type TripGroup = {
  slug: string;
  /** 旅の名前（`content/chapters.ts` が正本）。そのまま束の見出しになる */
  name: string;
  /** 旅の島（`/island/<旅>`） */
  href: string;
  from: string;
  to: string;
  rows: TripRow[];
  /** 枝の旅（イランまで歩く）。親の束の中に置く */
  branches: TripGroup[];
};

const ym = (d: string) => (d ? `${d.slice(0, 4)}/${d.slice(5, 7)}` : "いま");

/** 滞在の期間を「2024/10 – 11」のように縮める。同じ年なら年を省く。まだ居る滞在は「2026/11 –」 */
function span(s: { from: string; to: string }, day: string) {
  const a = ym(s.from);
  /* 終わりが先の日付なら、まだ終わっていない（今日と見比べる。焼いた日の答えを出さない） */
  if (!s.to || s.to > day) return `${a} –`;
  const b = ym(s.to);
  if (a === b) return a;
  return a.slice(0, 4) === b.slice(0, 4) ? `${a} – ${b.slice(5)}` : `${a} – ${b}`;
}

/** 「2024/10/28 – 2025/03/29」。旅の島へのリンクの添え書き */
const period = (from: string, to: string) => `${from.replace(/-/g, "/")} –${to ? ` ${to.replace(/-/g, "/")}` : ""}`;

/**
 * 「行った順に、ぜんぶ」。**旅で束ねる**（`docs/spec/model.md` M-5）。
 *
 * 束は本線の旅を始まった順に並べ、枝の旅（イランまで歩く）は親の束の中に置く。国は滞在から束に入るので、
 * 2つの旅に入った国（アルメニア）は両方の束に出る。
 *
 * **出すのは今日までに入った国だけ**（滞在の表には着く予定の行も書ける）。国境を越えた日に1行増える。
 * 焼いた日の答えで描いてから、画面が出たら今日で引き直す（`docs/island-misses.md` #30）。
 * 旅の日付は現地の暦で切る（`tripDate`）。
 */
export function TripList({ trips }: { trips: TripGroup[] }) {
  const [day, setDay] = useState(() => tripDate(BUILT_AT));
  const [now, setNow] = useState(() => chapterNow(BUILT_AT).slug);
  useEffect(() => {
    const t = new Date();
    setDay(tripDate(t));
    setNow(chapterNow(t).slug);
  }, []);

  /** 今日までに入った滞在だけを残した国。1つも残らない国は出さない */
  const seen = (rows: TripRow[]) =>
    rows.flatMap((r) => {
      const stays = r.stays.filter((s) => s.from <= day);
      return stays.length ? [{ ...r, stays }] : [];
    });
  const groups = trips
    .map((g) => ({
      ...g,
      rows: seen(g.rows),
      branches: g.branches.map((b) => ({ ...b, rows: seen(b.rows) })).filter((b) => b.rows.length),
    }))
    .filter((g) => g.rows.length);
  if (!groups.length) return null;

  /* **番号は、初めてその国に入った順**（束をまたいで1本の列）。2つの束に出る国は、どちらでも同じ番号 */
  const first = new Map<string, string>();
  for (const g of groups)
    for (const r of [...g.rows, ...g.branches.flatMap((b) => b.rows)])
      for (const s of r.stays) if (!first.has(r.slug) || s.from < first.get(r.slug)!) first.set(r.slug, s.from);
  const noOf = new Map(
    [...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([slug], i) => [slug, i + 1]),
  );
  /* 「いまここ」は、終わりの日が空の滞在（M-13）。**国に付く印**で、日付の隣に置く（街の列の末尾に置くと
     「その街にいる」と読める） */
  const hereOf = (r: TripRow) => r.stays.some((s) => !s.to);

  const list = (rows: TripRow[]) => (
    <ol className="atrip">
      {rows.map((r) => {
        const body = (
          <>
            <span className="atrip-flag">
              <Flag slug={r.slug} size={34} />
            </span>
            <span className="atrip-body">
              <span className="atrip-name">
                <b>{r.name}</b>
                {r.en && <em>{r.en}</em>}
              </span>
              <span className="atrip-when">
                {r.stays.map((s) => span(s, day)).join("、")}
                {hereOf(r) && <span className="atrip-here">いまここ</span>}
              </span>
              {/* 街が分かっていない国では、列ごと出さない。空の列は隙間になるだけ */}
              {r.towns.length > 0 && (
                <span className="atrip-tags">
                  {r.towns.slice(0, 5).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                  {r.towns.length > 5 && <span>ほか{r.towns.length - 5}</span>}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={r.slug}>
            <span className="atrip-rail" aria-hidden />
            <span className="atrip-no" aria-hidden>
              {noOf.get(r.slug)}
            </span>
            {/* **行き先を持たない国は、押せる形にしない。** 矢印（`tile-go`）と厚み（台）は「押すと進む」の合図
                なので、行き先が無い札には出さない（`docs/island-design.md` 3章。数えるのは `tools/sprites/popcheck.mjs`）。
                落ち影だけ残して、札の形は同じにする */}
            {r.href ? (
              <Link className="atrip-card" href={r.href} prefetch={false}>
                {body}
                <Icon name="right" size={15} className="tile-go" />
              </Link>
            ) : (
              <span className="atrip-card" style={{ boxShadow: "var(--shadow-1)", transform: "none" }}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );

  /** 束の頭の、旅の島へのリンク。**どの束にも1本**（前は `/travel` から旅の島へ1本も無かった） */
  const isle = (g: TripGroup, label: string) => (
    <Link className="tile atrip-isle" href={g.href} prefetch={false}>
      <Icon name="island" size={30} className="tile-icon" />
      <span className="tile-text">
        <b>{label}</b>
        <i>{period(g.from, g.to)}</i>
      </span>
      <Icon name="right" size={16} className="tile-go" />
    </Link>
  );

  return (
    <>
      {groups.map((g) => (
        <Fold
          key={g.slug}
          title={g.name}
          lead={g.rows.length > 1 ? `${g.rows[0].name}から${g.rows[g.rows.length - 1].name}まで` : g.rows[0].name}
          note={`${g.rows.length}カ国`}
          // 開けておくのは、いまいる旅の束ひとつ。2枚開くと、どこまで来たかが読みにくい
          open={g.slug === now}
        >
          {isle(g, `${g.name}の島へ`)}
          {list(g.rows)}
          {g.branches.map((b) => (
            <div key={b.slug} className="atrip-branch">
              {isle(b, `枝の旅「${b.name}」`)}
              {list(b.rows)}
            </div>
          ))}
        </Fold>
      ))}
    </>
  );
}
