import {
  BG_BASICS,
  BG_BUY,
  BG_EVENTS,
  BG_FACTS,
  BG_FOOD,
  BG_HERO,
  BG_HISTORY,
  BG_IMAGE,
  BG_MYMAPS,
  BG_PLACES,
  BG_SPOTS,
  BG_WORDS,
} from "@/content/bulgaria";

import { mapsSearch } from "@/lib/mapsSearch";

import type { Area, Fact, Guidebook, Guide, Item, MyMap, Pic, Place, Src, Todo } from "./types";

/**
 * **ソフィアのガイドブック**（`/travel/bulgaria/sofia`。前の `/bulgaria`）。#1228
 *
 * ## 誰が、何を調べて読むか
 *
 * | 読む人 | いつ・何に困って | ここで得て満足するもの |
 * | --- | --- | --- |
 * | バルカンを安く回る20〜30代の個人旅行者（**いちばん大事**） | スコピエかベオグラードを出る前。ソフィアに何日寄って何をするか決めかねている | やりたいこと8つ・見どころと名物の一覧・1日いくらか |
 * | ソフィアに着いた人 | 今日どこへ行くか・何を食べるか | 地図（マイマップ）と、名前で開く Google マップ |
 *
 * 狙う語: **ソフィア 観光／ソフィア 物価／ブルガリア 料理**。競合は大手の観光まとめと、ユーロ導入前（2025年まで）の
 * 個人ブログ。こちらが勝つのは「2026年のユーロ建ての値段」と「やりたいことを窓1枚で、行き方・お金・コツまで」。
 *
 * ## 字の出どころ
 *
 * 調べた事実は `content/bulgaria.ts`（`python/build_bulgaria.py` が `python/data/bulgaria/*.json` から焼く。
 * **直すなら JSON のほう**）。ここに書くのは**組み立て**だけ——どの見どころがどのやりたいことに出るか、
 * エリアの線引き、料理の絞りの札、基本情報の並び。足した事実（気候・1日の予算・大使館）は出どころつきで、
 * この下に字で持つ。
 *
 * ## あやとの好みは書かない（#1228・`docs/island-misses.md` #326）
 *
 * 前の面は、あやとの好み（豚・酒・ローカル市場）で ◎○⚠ を付け、「したいこと」も好みから組んでいた。
 * いまは**初めての人が見て面白いもの**を客観的に並べ、豚肉とアルコールはアイコンで知らせるだけにする。
 * **安さの観点は残す**（読む人がバルカンを安く回る旅人だから）。
 */

// ---------------------------------------------------------------------------
// 道具

/** 出どころの名前。**道から決める**（同じ道に別の名前が付かないように） */
const HOST: Record<string, string> = {
  "en.wikipedia.org": "Wikipedia",
  "bg.wikipedia.org": "Wikipedia（ブルガリア語）",
  "www.wikidata.org": "Wikidata",
  "www.openstreetmap.org": "OpenStreetMap",
  "www.euronews.com": "Euronews",
  "www.inyourpocket.com": "In Your Pocket",
  "inyourpocket.com": "In Your Pocket",
  "sofiahistorymuseum.bg": "ソフィア歴史博物館",
  "boyanachurch.info": "ボヤナ教会",
  "www.numbeo.com": "Numbeo",
  "www.novinite.com": "Novinite",
  "www.metrosofia.com": "Metropolitan Sofia",
  "ca-voir.com": "ca-voir",
  "www.gov.uk": "GOV.UK",
  "www.maff.go.jp": "農林水産省 動物検疫所",
  "www.mofa.go.jp": "外務省",
};

function src(url: string): Src {
  if (!url) throw new Error("content/guidebook/bulgaria-sofia.ts: 出どころの無い事実を載せようとした");
  const host = new URL(url).hostname;
  return { name: HOST[host] ?? host.replace(/^www\./, ""), url };
}

/** 同じ出どころを2回並べない */
const srcs = (...urls: (string | undefined)[]): Src[] => [...new Set(urls.filter((u): u is string => !!u))].map(src);

/** 名簿に**在るはずの**1件。無ければ書き出しを止める（名前を打ち間違えた札を、黙って落とさない） */
function must<T>(rows: readonly T[], hit: (r: T) => boolean, what: string): T {
  const r = rows.find(hit);
  if (!r) throw new Error(`content/guidebook/bulgaria-sofia.ts: ${what} が content/bulgaria.ts に無い`);
  return r;
}

const spot = (name: string) => must(BG_SPOTS, (s) => s.name === name, `見どころ「${name}」`);
const basic = (title: string) => must(BG_BASICS, (b) => b.title === title, `基本情報「${title}」`);
const history = (title: string) => must(BG_HISTORY, (b) => b.title === title, `歴史「${title}」`);
const image = (title: string) => must(BG_IMAGE, (b) => b.title === title, `イメージ「${title}」`);

type Shot = { img: string; thumb: string; big: string; cm: string; by: string; lic: string; alt: string };

/** 借りた写真。**出どころの書けない写真は使わない** */
function photo(s: Shot): Pic | undefined {
  if (!s.img || !s.cm || !s.lic) return undefined;
  return { src: s.img, small: s.thumb, big: s.big, alt: s.alt, kind: "photo", credit: { by: s.by, lic: s.lic, page: s.cm } };
}

/** 円に直す。**レートは1か所**（`BG_RATE` と同じ 1ユーロ＝177円・2026年11月6日） */
const RATE = { unit: "ユーロ", yen: 177, date: "2026-11-06" };
const yen = (eur: number) => Math.round((eur * RATE.yen) / 100) * 100;

// ---------------------------------------------------------------------------
// 見たいもの

/**
 * 見どころの id（窓の `#see-<id>`）とエリア。
 *
 * **エリアの無いもの（ボヤナ教会・ヴィトシャ山・リラ修道院ほか）は、描いた絵地図の外。** 前は「山と郊外」という
 * エリアの札にしていたが、見どころマップでは絵の縁の矢印（manifest の `beyond`）と、一覧の「地図の外」に出す
 * （スコピエのヴォドノ山と同じ形。#1228）。
 *
 * Google マップの道は焼いたもの（`BG_SPOTS.maps`。`python/build_bulgaria.py` の `spot_maps` が
 * 「現地の字の名前＋街」で組む）をそのまま使う。ここで語を書き直さない（2か所で組むと片方だけ古くなる）。
 */
const SPOTS: Record<string, { id: string; area?: string }> = {
  "聖ゲオルギ教会（円堂）": { id: "rotunda", area: "center" },
  "古代セルディカ遺跡（ラルゴの地下）": { id: "serdica", area: "center" },
  "アレクサンドル・ネフスキー大聖堂": { id: "nevsky", area: "nevsky" },
  "中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口": { id: "mineral-bath", area: "center" },
  "ボヤナ教会（世界遺産）": { id: "boyana" },
  "聖ネデリャ教会": { id: "nedelya", area: "center" },
  "聖ソフィア教会": { id: "sveta-sofia", area: "nevsky" },
  "バーニャ・バシ・モスク": { id: "banya-bashi", area: "center" },
  "ソフィア・シナゴーグ": { id: "synagogue", area: "market" },
  "聖ヨシフ大聖堂": { id: "st-joseph", area: "market" },
  "中央市場ホール（ハリ）": { id: "market-hall", area: "market" },
  "ヴィトシャ大通り（歩行者区間）": { id: "vitosha-blvd", area: "south" },
  "聖ペトカ地下教会": { id: "sveta-petka", area: "center" },
  "国立考古学博物館": { id: "archaeology", area: "center" },
  "女性市場（ジェンスキ・パザール）": { id: "zhenski-pazar", area: "market" },
  "ロシア教会（奇蹟者聖ニコライ聖堂）": { id: "russian-church", area: "nevsky" },
  "イヴァン・ヴァゾフ国立劇場と市庭園": { id: "national-theatre", area: "nevsky" },
  "国立文化宮殿（NDK）": { id: "ndk", area: "south" },
  "国立歴史博物館（ボヤナ）": { id: "history-museum" },
  "ヴィトシャ山（チェルニ・ヴラフ）": { id: "vitosha" },
  "ボリス公園": { id: "borisova", area: "south" },
  "リラ修道院（日帰り）": { id: "rila" },
};

const spotId = (name: string) => {
  const m = SPOTS[name];
  if (!m) throw new Error(`content/guidebook/bulgaria-sofia.ts: 見どころ「${name}」の id が SPOTS に無い`);
  return m.id;
};

/* 名簿と食い違ったまま書き出さない。**見どころが増えたら、ここで止まる** */
{
  const miss = BG_SPOTS.filter((s) => !SPOTS[s.name]).map((s) => s.name);
  if (miss.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: SPOTS に無い見どころ（${miss.join("、")}）`);
}

/** 星の言葉（1＝必見） */
const STAR = ["", "必見", "行けたら", "余裕があれば"] as const;

const SEE: Item[] = BG_SPOTS.map((s) => {
  const m = SPOTS[s.name];
  const facts: Fact[] = [
    { label: "お金", text: s.fee },
    { label: "行き方", text: s.how },
    { label: "距離", text: s.walk },
    { label: "時間", text: s.stay },
  ];
  return {
    id: m.id,
    name: s.name,
    local: { text: s.cyr, lang: "bg", roman: s.roman, kana: s.kana },
    rank: s.rank as 1 | 2 | 3,
    pic: photo(s),
    line: s.far ? `中心から${s.far}km` : s.walk.replace(/（.*?）/, ""),
    body: s.what,
    facts,
    tip: s.advice,
    maps: s.maps,
    ...(m.area ? { area: m.area } : {}),
    at: { lat: s.lat, lon: s.lon },
    src: srcs(s.src, s.feesrc),
  };
});

// ---------------------------------------------------------------------------
// やりたいこと。**最大8。** ソフィアは見どころが中心の1kmに固まっていて、日帰りが2つ（山とリラ修道院）。

/** やりたいことの窓に出す、見どころの欄をそのまま引く道具 */
const of = (name: string) => spot(name);

/**
 * 何か所かの見学時間を足す。**短いほうで足す**（「30分（地下を入れて45分）」の30分）。長いほうで足すと、
 * 回る順の話が「丸一日」になる（`docs/country-guide.md` 4章の歩くコースと同じ決まり）
 */
function sumStay(names: string[]): string {
  const m = names.map((n) => {
    const x = /^([0-9]+)分/.exec(spot(n).stay);
    if (!x) throw new Error(`content/guidebook/bulgaria-sofia.ts: 「${n}」の見学時間が「◯分」で始まっていない（${spot(n).stay}）`);
    return Number(x[1]);
  });
  const all = m.reduce((a, b) => a + b, 0);
  return all >= 60 ? `${Math.floor(all / 60)}時間${all % 60 ? `${all % 60}分` : ""}` : `${all}分`;
}

function todo(t: Omit<Todo, "pic" | "src"> & { picOf: string; extra?: string[] }): Todo {
  const { picOf, extra = [], ...rest } = t;
  const shots = [picOf, ...t.see.map((id) => BG_SPOTS.find((s) => SPOTS[s.name].id === id)?.name)].filter(Boolean) as string[];
  const used = shots.map(spot);
  return {
    ...rest,
    pic: photo(spot(picOf)),
    src: srcs(...used.flatMap((s) => [s.src, s.feesrc]), ...extra),
  };
}

const TODO: Todo[] = [
  todo({
    id: "churches",
    title: "壁画の教会を、歩いて3つはしごする",
    lead: "4世紀の円堂・6世紀の教会・金のドームの大聖堂",
    picOf: "アレクサンドル・ネフスキー大聖堂",
    what: `時代の違う3つの教会が、中心から歩ける範囲に並んでいる。いちばん古い聖ゲオルギ教会（円堂）は4世紀のローマ時代の赤れんがの塔で、ドームの内側に中世のフレスコが層になって残る。聖ソフィア教会は6世紀の建物で、街の名前の由来。最後のアレクサンドル・ネフスキー大聖堂は1912年完成で、内部がイコンとフレスコで埋まっている。`,
    how: `円堂は大統領府の中庭にあり、${of("聖ゲオルギ教会（円堂）").walk}。聖ソフィア教会とネフスキー大聖堂は隣どうしで、地下鉄 Св. Климент Охридски 駅から歩いて6分ほど。`,
    time: `見学だけで約${sumStay(["聖ゲオルギ教会（円堂）", "聖ソフィア教会", "アレクサンドル・ネフスキー大聖堂"])}（地下を入れると長くなる）`,
    money: `3つとも本堂は無料。地下だけ有料で、聖ソフィア教会の地下（初期キリスト教の墓とモザイク）は大人4.00ユーロ（約710円）、ネフスキー大聖堂の地下のイコン博物館は大人10.00ユーロ（約1,770円）・月曜休み。`,
    tip: `肩と膝を出さない服装で。ネフスキー大聖堂の内部は撮影が制限される。聖ソフィア教会は地上だけ見て帰る人が多いが、見どころは地下（入口は建物の横）。`,
    route: `西の円堂から東へ歩くと、古い順に回れる（円堂 → 聖ソフィア教会 → ネフスキー大聖堂）。途中のツァル・オスヴォボディテル大通り沿いに、金のドームと緑の尖塔のロシア教会がある。`,
    see: ["rotunda", "sveta-sofia", "nevsky", "russian-church"],
  }),
  todo({
    id: "serdica",
    title: "地下鉄の改札の横で、ローマの街を歩く",
    lead: "2世紀の石畳が、地下通路にそのまま出ている",
    picOf: "古代セルディカ遺跡（ラルゴの地下）",
    what: of("古代セルディカ遺跡（ラルゴの地下）").what,
    how: of("古代セルディカ遺跡（ラルゴの地下）").how,
    time: of("古代セルディカ遺跡（ラルゴの地下）").stay,
    money: of("古代セルディカ遺跡（ラルゴの地下）").fee,
    tip: of("古代セルディカ遺跡（ラルゴの地下）").advice,
    route: `同じ駅のコンコースから階段を上がると、地面より一段低い所に14世紀の聖ペトカ地下教会。地上の広場に聖ネデリャ教会、そこから歩いて2分で円堂。`,
    see: ["serdica", "sveta-petka", "nedelya", "rotunda"],
  }),
  todo({
    id: "hot-spring",
    title: "街の真ん中で、湧いている温泉を汲む",
    lead: "蛇口は24時間、ただ。地元の人がポリタンクで並ぶ",
    picOf: "中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口",
    what: `${of("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").what} 市内には49の鉱泉・温泉があり、街がここにできたのも、そもそも湯が出たからだとされる。`,
    how: of("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").how,
    time: of("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").stay,
    money: of("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").fee,
    tip: of("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").advice,
    route: `すぐ西のバーニャ・バシ・モスクも、同じ湯の上に建っている（名前はトルコ語で「たくさんの浴場」）。中央市場ホールまでも歩いてすぐ。`,
    see: ["mineral-bath", "banya-bashi", "market-hall"],
    extra: [history("温泉の上に建った街").src],
  }),
  todo({
    id: "vitosha-blvd",
    title: "ヴィトシャ大通りを、山に向かって歩く",
    lead: "テラスの並ぶ歩行者の大通り。正面にヴィトシャ山",
    picOf: "ヴィトシャ大通り（歩行者区間）",
    what: of("ヴィトシャ大通り（歩行者区間）").what,
    how: `${of("ヴィトシャ大通り（歩行者区間）").how} 北の端は聖ネデリャ教会（${of("ヴィトシャ大通り（歩行者区間）").walk}）。`,
    time: of("ヴィトシャ大通り（歩行者区間）").stay,
    money: of("ヴィトシャ大通り（歩行者区間）").fee,
    tip: of("ヴィトシャ大通り（歩行者区間）").advice,
    route: `聖ネデリャ教会から南へ、突き当たりの国立文化宮殿（NDK）まで。歩くあいだ、通りの正面にヴィトシャ山が見えている。`,
    see: ["vitosha-blvd", "nedelya", "ndk"],
  }),
  todo({
    id: "market",
    title: "市場で、量り売りのチーズとパイを買う",
    lead: "1878年からの青空市場と、1911年の屋内市場",
    picOf: "女性市場（ジェンスキ・パザール）",
    what: `${of("女性市場（ジェンスキ・パザール）").what} 歩いてすぐの中央市場ホール（ハリ）は1911年完成の屋内市場で、白いチーズ（сирене）・黄色いチーズ（кашкавал）・赤いペーストのリュテニツァを量り売りで買える。`,
    how: `${of("女性市場（ジェンスキ・パザール）").how} 中央市場ホールはバーニャ・バシ・モスクとシナゴーグの間。`,
    time: `女性市場 ${of("女性市場（ジェンスキ・パザール）").stay}・中央市場ホール ${of("中央市場ホール（ハリ）").stay}`,
    money: `入場はどちらも無料。チーズは100gあたり1〜2ユーロ（約180〜350円）、パン屋のバニツァは1〜2ユーロ（約180〜350円）。`,
    tip: `${of("女性市場（ジェンスキ・パザール）").advice} 中央市場ホールは屋根があるので、雨と寒さの日に。`,
    route: `女性市場から東へ歩くと中央市場ホール。温泉の蛇口（中央鉱泉浴場）もすぐそば。`,
    see: ["zhenski-pazar", "market-hall", "synagogue"],
    extra: [
      must(BG_BUY, (b) => b.what.startsWith("白チーズとカシュカヴァル"), "土産「白チーズとカシュカヴァル」").src,
      must(BG_FOOD, (f) => f.jp === "バニツァ", "料理「バニツァ」").src,
    ],
  }),
  todo({
    id: "boyana",
    title: "世界遺産のボヤナ教会で、10分だけ壁画を見る",
    lead: "一度に9人・10分。ルネサンスより200年早い顔の壁画",
    picOf: "ボヤナ教会（世界遺産）",
    what: of("ボヤナ教会（世界遺産）").what,
    how: `${of("ボヤナ教会（世界遺産）").walk}。${of("ボヤナ教会（世界遺産）").how}`,
    time: of("ボヤナ教会（世界遺産）").stay,
    money: of("ボヤナ教会（世界遺産）").fee,
    tip: of("ボヤナ教会（世界遺産）").advice,
    route: `国立歴史博物館まで歩いて15分。同じ日にまとめる。`,
    see: ["boyana", "history-museum"],
  }),
  todo({
    id: "rila",
    title: "リラ修道院へ、日帰りで行く",
    lead: "縞模様のアーチと極彩色のフレスコの中庭。世界遺産",
    picOf: "リラ修道院（日帰り）",
    what: of("リラ修道院（日帰り）").what,
    how: `${of("リラ修道院（日帰り）").how}（${of("リラ修道院（日帰り）").walk}）`,
    time: of("リラ修道院（日帰り）").stay,
    money: of("リラ修道院（日帰り）").fee,
    tip: of("リラ修道院（日帰り）").advice,
    route: `移動を含めて丸1日。ほかの予定と同じ日に入れない。`,
    see: ["rila"],
  }),
  todo({
    id: "vitosha",
    title: "ヴィトシャ山に上がって、街を見下ろす",
    lead: "街のすぐ南の2,290m。市内からバスで登山口へ",
    picOf: "ヴィトシャ山（チェルニ・ヴラフ）",
    what: of("ヴィトシャ山（チェルニ・ヴラフ）").what,
    how: of("ヴィトシャ山（チェルニ・ヴラフ）").how,
    time: of("ヴィトシャ山（チェルニ・ヴラフ）").stay,
    money: of("ヴィトシャ山（チェルニ・ヴラフ）").fee,
    tip: of("ヴィトシャ山（チェルニ・ヴラフ）").advice,
    route: `半日（4〜5時間）かかる。行く日に、バスとゴンドラの運行を確かめてから出る。山の上は市内より数段寒い。`,
    see: ["vitosha"],
  }),
];

if (TODO.length > 8) throw new Error("content/guidebook/bulgaria-sofia.ts: やりたいことは最大8（#1228）");

/* 見たいもの → やりたいこと の繋ぎ。**やりたいことの `see` から逆に引く**（2か所に書かない） */
for (const it of SEE) {
  const t = TODO.filter((x) => x.see.includes(it.id)).map((x) => x.id);
  if (t.length) it.todo = t;
}
{
  const ids = new Set(SEE.map((s) => s.id));
  const bad = TODO.flatMap((t) => t.see.filter((id) => !ids.has(id)).map((id) => `${t.id}→${id}`));
  if (bad.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: やりたいことが無い見どころを指している（${bad.join("、")}）`);
}

// ---------------------------------------------------------------------------
// どんな街

/**
 * エリア。**線は見どころの位置で引いた**（`python/data/bulgaria/facts.json` の緯度経度）。
 * 字は見どころの事実をつないだもので、出どころはそのエリアの見どころのもの。
 */
const AREAS_BASE: Omit<Area, "see" | "src">[] = [
  {
    id: "center",
    plan: [2, 1, 1],
    name: "中心・セルディカ",
    color: "#ffd98a",
    lead: "ローマの石畳と、湧き出る温泉",
    body: "地下鉄セルディカ駅のまわり。2世紀の通りと城壁が改札の横に出ていて、4世紀の円堂・温泉の蛇口・モスクが歩いて数分の中に並ぶ。見どころの多くはここから歩いて回れる。",
  },
  {
    id: "market",
    plan: [1, 1, 1],
    name: "市場とシナゴーグ",
    color: "#bfe8a6",
    lead: "量り売りのチーズとパイ。街の台所",
    body: "1878年に始まった青空市場（女性市場）と、1911年の屋内市場（中央市場ホール）。土産物ではなく、街の人が今日の晩飯を買いに来る所。南東ヨーロッパ最大のシナゴーグとカトリックの大聖堂もこの一角。",
  },
  {
    id: "nevsky",
    plan: [3, 1, 1],
    name: "ネフスキー大聖堂まわり",
    color: "#a9dcf5",
    lead: "金のドームと、街の名前になった教会",
    body: "金のドームのアレクサンドル・ネフスキー大聖堂と、街の名前の由来になった6世紀の聖ソフィア教会が隣どうし。西へ戻ると、金のドームと緑の尖塔のロシア教会。国立劇場の前の市庭園は、市内でいちばん古い公園（1872年）。",
  },
  {
    id: "south",
    plan: [2, 2, 2],
    name: "ヴィトシャ大通りと公園",
    color: "#ffc4d2",
    lead: "テラスの並ぶ歩行者の大通り",
    body: "聖ネデリャ教会から南へ伸びる、街でいちばん有名な通り。突き当たりが国立文化宮殿（NDK）で、正面にヴィトシャ山が見える。南東には、ソフィアでいちばん大きなボリス公園。",
  },
];

const AREAS: Area[] = AREAS_BASE.map((a) => {
  const mine = BG_SPOTS.filter((s) => SPOTS[s.name].area === a.id);
  if (!mine.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: 見どころが1つも無いエリア（${a.id}）`);
  return { ...a, see: mine.map((s) => spotId(s.name)), src: srcs(...mine.map((s) => s.src)) };
});
for (const it of SEE) if (it.area && !AREAS.some((a) => a.id === it.area)) throw new Error(`エリアの無い見どころ: ${it.name}`);

const fact = (n: string) => must(BG_FACTS, (f) => f.n === n, `驚く数「${n}」`);

const ABOUT = [
  {
    id: "serdica",
    num: "前7000",
    unit: "年ごろから",
    title: "もとの名前は「セルディカ」",
    lead: "ローマ皇帝が「我がローマ」と呼んだと伝わる街",
    ...pick(history("もとの名前は「セルディカ」")),
  },
  {
    id: "capital",
    num: fact("1879").n,
    unit: "年に首都",
    title: "500年のオスマン帝国の街から",
    lead: "モスクが教会に、教会がモスクに",
    ...pick(history("500年のオスマン支配と、1879年の首都")),
  },
  {
    id: "springs",
    num: fact("49").n,
    unit: "の温泉",
    title: "温泉の上に建った街",
    lead: "中心の蛇口の湯は無料",
    ...pick(history("温泉の上に建った街")),
  },
  {
    id: "tolerance",
    num: "4",
    unit: "つの宗教",
    title: "寛容のトライアングル",
    lead: "正教会・モスク・シナゴーグ・カトリック",
    ...pick(history("寛容のトライアングル")),
  },
];

function pick(h: { body: string; src: string }) {
  return { body: h.body, src: srcs(h.src) };
}

/** 「よく言われること」。題と本文は調べた事実のまま */
const MORE: Guide[] = [
  { id: "motto", icon: "flag", t: history("街の標語は「育つが、老いない」") },
  { id: "yogurt", icon: "milk", t: image("ヨーグルト") },
  { id: "cheap", icon: "coin", t: image("「東欧で物価が安い国」") },
  { id: "rose", icon: "flower", t: image("バラの国") },
].map(({ id, icon, t }) => ({
  id,
  icon,
  title: t.title,
  lead: "",
  parts: [{ h: "", text: t.body }],
  src: srcs(t.src),
})) as Guide[];

// ---------------------------------------------------------------------------
// 食べたいもの

/** 絞りの札。**1品が2つの札に入ってよい**（ボザは朝ごはんで、飲みものでもある） */
const KINDS = [
  { id: "breakfast", label: "朝ごはん" },
  { id: "dish", label: "食堂で" },
  { id: "street", label: "市場と屋台" },
  { id: "drink", label: "飲みもの" },
];

/** 料理の id（`roman` から作る）と、絞りの札。**札の無い料理は書き出しを止める** */
const FOOD_KIND: Record<string, string[]> = {
  "shopska-salata": ["dish"],
  banitsa: ["breakfast", "street"],
  kebapche: ["dish"],
  kyufte: ["dish"],
  tarator: ["dish"],
  "kiselo-mlyako": ["breakfast", "street"],
  gyuvech: ["dish"],
  kavarma: ["dish"],
  musaka: ["dish"],
  "shkembe-chorba": ["dish"],
  sarma: ["dish"],
  lyutenitsa: ["street"],
  "sirene-kashkaval": ["street"],
  lukanka: ["street"],
  patatnik: ["dish"],
  "mish-mash": ["breakfast", "dish"],
  "bob-chorba": ["dish"],
  mekitsa: ["breakfast", "street"],
  boza: ["breakfast", "drink"],
  rakiya: ["drink"],
  ayryan: ["drink"],
  mehana: ["dish"],
  "varena-tsarevitsa": ["street"],
};

/** 札の1行に出す値段。**ユーロの数だけ**（円と但し書きは窓の中）。「約」は落とさない（古い記事のレフを直した額がある）。数の無い字は出さない */
const euroOf = (price: string) => price.match(/約?[0-9][0-9.,]*(?:〜[0-9][0-9.,]*)?\s*ユーロ/)?.[0].replace(/\s+/g, "");

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** 店・市場。Google マップの道は焼いたもの（`BG_PLACES.maps`。店は名前と通り＋街で探す） */
const PLACES: Place[] = BG_PLACES.map((p) => ({
  id: `p${p.n}`,
  name: p.label,
  roman: p.roman || undefined,
  what: p.what,
  maps: p.maps,
  km: p.on ? undefined : p.km,
}));
const placeIds = (pins: readonly number[]) => pins.map((n) => `p${n}`);

const EAT: Item[] = BG_FOOD.map((d) => {
  const id = slug(d.roman.split("/").map((x) => x.trim()).join(" "));
  const kinds = FOOD_KIND[id];
  if (!kinds) throw new Error(`content/guidebook/bulgaria-sofia.ts: 料理「${d.jp}」（${id}）の絞りの札が FOOD_KIND に無い`);
  const facts: Fact[] = [
    { label: "どこで", text: d.where },
    ...(d.price ? [{ label: "値段", text: d.price }] : []),
    { label: "中身", text: d.note },
  ];
  return {
    id,
    name: d.jp,
    local: { text: d.cyr, lang: "bg", roman: d.roman, kana: d.kana },
    rank: d.rank as 1 | 2 | 3,
    pic: photo(d),
    line: euroOf(d.price),
    body: d.what,
    facts,
    /* 料理は「料理名＋街」で調べる。近くの店が並ぶ（#1228 決めたこと4。焼いた `near`） */
    maps: d.near,
    places: d.pins.length ? placeIds(d.pins) : undefined,
    kinds,
    flags: { pork: d.pork, alcohol: d.alcohol },
    src: srcs(d.src, d.meatsrc),
  };
});

// ---------------------------------------------------------------------------
// 買いたいもの

const BUY_ID: Record<string, string> = {
  "バラのオイル／ローズウォーター": "rose-oil",
  "リュテニツァ（赤いペースト）": "lyutenitsa",
  "トロヤン焼きの陶器": "troyan-pottery",
  "ラキヤ（果実の蒸留酒）": "rakiya",
  "ブルガリアワイン（マヴルッド、メルニク）": "wine",
  "マルテニツァ（赤と白の紐飾り）": "martenitsa",
  "白チーズとカシュカヴァル（量り売り）": "cheese",
  "ローズジャムとローズのロクム": "rose-jam",
  "刺繍（シェヴィツァ）の小物": "shevitsa",
};

const BUY: Item[] = BG_BUY.map((b) => {
  const id = BUY_ID[b.what];
  if (!id) throw new Error(`content/guidebook/bulgaria-sofia.ts: 土産「${b.what}」の id が BUY_ID に無い`);
  return {
    id,
    name: b.what,
    local: { text: b.cyr, lang: "bg" },
    pic: photo(b),
    line: euroOf(b.price),
    body: b.why,
    facts: [
      { label: "どこで", text: b.where },
      { label: "値段", text: b.price },
    ],
    maps: b.near,
    places: b.pins.length ? placeIds(b.pins) : undefined,
    flags: { alcohol: b.alcohol },
    src: srcs(b.src),
  };
});

// ---------------------------------------------------------------------------
// 基本情報

const b = basic;
const part = (title: string, h = title) => ({ h, text: b(title).body });

const GUIDES: Guide[] = [
  {
    id: "airport",
    icon: "airport",
    title: "空港から市内",
    lead: "地下鉄M4で約20分・0.80ユーロ",
    parts: [part("空港から市内", "地下鉄で"), part("ビザ", "入国")],
    src: srcs(b("空港から市内").src, b("ビザ").src),
  },
  {
    id: "transit",
    icon: "tram",
    title: "乗り物",
    lead: "地下鉄・トラム・バス共通の1回券",
    parts: [part("市内の移動", "地下鉄・トラム・バス"), part("タクシー")],
    src: srcs(b("市内の移動").src, b("タクシー").src),
  },
  {
    id: "pay",
    icon: "currency",
    title: "払いかた",
    lead: "ユーロ。カードはよく通る",
    parts: [part("通貨"), part("両替・カード", "カードと現金"), part("手数料無料のATM", "ATM"), part("チップ")],
    src: srcs(b("通貨").src, b("両替・カード").src, b("手数料無料のATM").src, b("チップ").src),
  },
  {
    id: "net",
    icon: "wifi",
    title: "ネットと電源",
    lead: "SIMは街の直営店で。プラグはC・F",
    parts: [part("SIM・ネット", "SIM"), part("電源とプラグ", "電源")],
    src: srcs(b("SIM・ネット").src, b("電源とプラグ").src),
  },
  {
    id: "safety",
    icon: "key",
    title: "治安のコツ",
    lead: "落ち着いている。夜は騒がない",
    parts: [part("治安"), part("旅行者として気をつける法律", "気をつける法律"), part("水道水")],
    src: srcs(b("治安").src, b("旅行者として気をつける法律").src, b("水道水").src),
  },
  {
    id: "words",
    icon: "phrase",
    title: "ひとこと現地語",
    lead: "Здравейте（ズドラヴェイテ）＝こんにちは",
    parts: [part("言葉と文字", "キリル文字"), { h: "うなずくと「いいえ」", text: image("うなずくと「いいえ」").body }],
    words: BG_WORDS.map((w) => ({ local: { text: w.cyr, lang: "bg", roman: w.roman, kana: w.kana }, jp: w.jp })),
    src: srcs(b("言葉と文字").src, image("うなずくと「いいえ」").src),
  },
];

/**
 * 気候。**ソフィアの平年値（1991〜2020年・NIMH）**。Wikipedia の気候表から写した（2026-11-15 に見た）。
 * 出どころの表は NOAA／WMO の平年値。
 */
const CLIMATE = {
  months: [
    [3.5, -3.9, 35.9],
    [6.5, -2.4, 35.5],
    [11.4, 1.1, 45.3],
    [16.7, 5.3, 52.3],
    [21.4, 9.8, 73.1],
    [25.2, 13.4, 81.6],
    [27.8, 15.3, 64.7],
    [28.3, 15.0, 53.1],
    [23.3, 10.9, 52.3],
    [17.6, 6.3, 53.9],
    [10.7, 1.9, 38.1],
    [4.6, -2.4, 39.9],
  ].map(([hi, lo, mm]) => ({ hi, lo, mm })),
  note: "平均最高と平均最低（1991〜2020年の平年値）",
  src: srcs("https://en.wikipedia.org/wiki/Sofia"),
};

const SEASON: Guide = {
  id: "season",
  icon: "sun",
  title: "季節と行事",
  lead: "歩きやすいのは5〜6月と9月",
  parts: [
    {
      h: "歩きやすい季節",
      text: "平均最高気温が21〜25℃になるのは5月・6月・9月。7〜8月は最高28℃前後、12〜2月は最低気温が氷点下になる。雨がいちばん多いのは6月（平年 81.6mm）。",
    },
    part("11月の気候と服装", "11月"),
    ...BG_EVENTS.map((e) => ({ h: `${e.what}（${e.when}）`, text: e.body })),
  ],
  src: srcs(CLIMATE.src[0].url, b("11月の気候と服装").src, ...BG_EVENTS.map((e) => e.src)),
};

/* 1日の予算（宿代は別）。値はユーロ。**数は全部、出どころの字から**（足し算だけこちらでする） */
const BUDGET = {
  rows: [
    {
      label: "朝",
      what: "パン屋のバニツァ",
      eur: [1, 2] as [number, number],
      src: srcs(must(BG_FOOD, (f) => f.jp === "バニツァ", "料理「バニツァ」").src),
    },
    { label: "昼", what: "安い店の食事", eur: [15, 15] as [number, number], src: srcs(b("物価の目安").src) },
    { label: "夜", what: "安い店の食事", eur: [15, 15] as [number, number], src: srcs(b("物価の目安").src) },
    { label: "お茶", what: "カプチーノ", eur: [3.13, 3.13] as [number, number], src: srcs(b("物価の目安").src) },
    { label: "移動", what: "1日券（地下鉄・トラム・バス）", eur: [2, 2] as [number, number], src: srcs(b("市内の移動").src) },
    {
      label: "見る",
      what: "有料の見どころ1つ（無料の所だけなら0）",
      eur: [0, 10] as [number, number],
      src: srcs(spot("アレクサンドル・ネフスキー大聖堂").feesrc),
    },
  ],
  tips: [
    {
      text: "見どころの多くは無料。円堂・セルディカの地下通路・ネフスキー大聖堂の本堂・温泉の蛇口は、1円もかからない。",
      src: srcs(
        spot("聖ゲオルギ教会（円堂）").feesrc,
        spot("古代セルディカ遺跡（ラルゴの地下）").feesrc,
        spot("アレクサンドル・ネフスキー大聖堂").feesrc,
        spot("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").feesrc,
      ),
    },
    { text: "1日に何度も乗るなら1日券（2.00ユーロ・約350円）。1回券は0.80ユーロ（約140円）。", src: srcs(b("市内の移動").src) },
    {
      text: "スーパーは Lidl・Kaufland・Billa。野菜と果物は、スーパーより青空市場（女性市場・中央市場ホール）のほうが安い。",
      src: srcs(b("いちばん安いスーパー").src),
    },
    { text: "ATMは銀行の名前が出ているものを使い、「ユーロで」を選ぶ。Euronet の ATM は避ける。", src: srcs(b("手数料無料のATM").src) },
    {
      text: "ヴィトシャ大通りの店は1〜2割高め。東に2ブロック入ったツァル・シシュマン通りのほうが落ち着いている。",
      src: srcs(spot("ヴィトシャ大通り（歩行者区間）").src),
    },
  ],
};

const total = BUDGET.rows.reduce((a, r) => [a[0] + r.eur[0], a[1] + r.eur[1]], [0, 0]);
const eurText = (v: number) => (Math.round(v) === v ? `${v}` : v.toFixed(0));

const PACK = [
  { icon: "plug", label: "変換プラグ（C・F）", why: "電気は230V。プラグは丸ピン2本", src: srcs(b("電源とプラグ").src) },
  { icon: "jacket", label: "冬の上着（11〜3月）", why: "11月でも朝晩は氷点下近く。雪の日もある", src: srcs(b("11月の気候と服装").src) },
  {
    icon: "shirt",
    label: "肩と膝を隠せる服",
    why: "教会は肩と膝を出さない服装で。リラ修道院は肌を出した服装では入れない",
    src: srcs(spot("アレクサンドル・ネフスキー大聖堂").src, spot("リラ修道院（日帰り）").src),
  },
  { icon: "coin", label: "小銭の現金（ユーロ）", why: "市場・小さな食堂・公衆トイレはカードが使えないことがある", src: srcs(b("両替・カード").src) },
  {
    icon: "bottle",
    label: "空のペットボトル",
    why: "水道水は飲める。温泉の蛇口の湯も、汲んで冷まして飲める",
    src: srcs(b("水道水").src, spot("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").src),
  },
  { icon: "passport", label: "パスポート", why: "観光はビザ不要。180日のうち90日まで", src: srcs(b("ビザ").src) },
] as Guidebook["basics"]["pack"];

const HELP = {
  calls: [
    {
      num: "112",
      label: "警察・救急・消防",
      note: "EU共通の緊急の番号。携帯から無料",
      src: srcs(b("治安").src, b("旅行者として気をつける法律").src),
    },
  ],
  embassy: {
    name: "在ブルガリア日本国大使館",
    address: "ul. Lyulyakova gradina 14, Sofia",
    tel: "+359 2 971 2708",
    hours: "平日 8:30〜12:30・13:30〜17:00（17:15までとする案内もある）",
    maps: mapsSearch("Embassy of Japan", "София"),
    src: srcs("https://inyourpocket.com/Bulgaria/sofia/venues/embassy-of-japan", "https://www.mofa.go.jp/mofaj/annai/zaigai/list/europe/bulgaria.html"),
  },
};

// ---------------------------------------------------------------------------
// 地図

function mymap(which: "see" | "eat" | "buy"): MyMap {
  const m = must(BG_MYMAPS, (x) => x.which === which, `マイマップ「${which}」`);
  return { mid: m.mid, title: m.title, ll: m.ll, z: m.z, pins: m.pins };
}

/** 見たいもののうち、地図の中心から離れているもの（マイマップを引かないと見えない）。名前と距離で地図の下に出す */
const FAR: Place[] = BG_SPOTS.filter((s) => s.far > 0).map((s) => ({
  id: spotId(s.name),
  name: s.name.replace(/（.*?）$/, ""),
  what: "",
  maps: s.maps,
  km: s.far,
}));

// ---------------------------------------------------------------------------

const hero = photo(BG_HERO);
if (!hero) throw new Error("content/guidebook/bulgaria-sofia.ts: 表紙の写真（BG_HERO）が無い");

export const SOFIA: Guidebook = {
  country: "bulgaria",
  city: "sofia",
  name: "ソフィア",
  kicker: "ブルガリア",
  local: { text: "София", lang: "bg", roman: "Sofia" },
  lead: "ローマの遺跡と、ただで湧く温泉の首都",
  cover: hero,
  title: "ソフィアのガイド｜やりたいこと8選・料理・1日の予算",
  description: `ブルガリアの首都ソフィア。ローマの遺跡と無料の温泉の蛇口、やりたいこと${TODO.length}選、名物料理${EAT.length}品。1日の予算は宿代別で約${eurText(total[0])}ユーロから、空港から地下鉄で約20分・0.80ユーロ。`,
  published: "2026-11-06",
  updated: "2026-11-15",
  rate: RATE,
  about: { cards: ABOUT, more: MORE, areas: AREAS },
  todo: TODO,
  see: { items: SEE, map: mymap("see"), far: FAR },
  eat: { kinds: KINDS, items: EAT, places: PLACES.filter((p) => BG_FOOD.some((f) => placeIds(f.pins).includes(p.id))), map: mymap("eat") },
  buy: { items: BUY, places: PLACES.filter((p) => BG_BUY.some((x) => placeIds(x.pins).includes(p.id))), map: mymap("buy") },
  /* ソフィアのショートはまだ無い（`content/shorts.ts` に「ブルガリア」「ソフィア」の題の回が無い。2026-11-15）。
     アーカイブは国の鍵（`ブルガリア`）に積まれていく */
  videos: { streams: { country: "bulgaria", city: "ブルガリア" }, shorts: [] },
  basics: {
    summary: [
      { id: "season", icon: "sun", label: "歩きやすい季節", value: "5〜6月・9月", lead: "平均最高 21〜25℃", to: "#guide-season" },
      { id: "safety", icon: "key", label: "治安", value: "落ち着いている", lead: "スリに注意。緊急は112", to: "#guide-safety" },
      {
        id: "budget",
        icon: "wallet",
        label: "1日の予算",
        value: `約${eurText(total[0])}ユーロ〜`,
        lead: `宿代は別。約${yen(total[0]).toLocaleString("ja-JP")}円〜`,
        to: "#budget",
      },
      { id: "move", icon: "tram", label: "移動", value: "1回 0.80ユーロ", lead: "空港から地下鉄で約20分", to: "#guide-transit" },
    ],
    guides: GUIDES,
    season: SEASON,
    budget: BUDGET,
    pack: PACK,
    climate: CLIMATE,
    help: HELP,
  },
};

/** 1日の予算の合計（ユーロ）。面と題の一文が同じ数を言うように、ここで1回だけ足す */
export const SOFIA_BUDGET_TOTAL = total as [number, number];
export const yenOf = yen;
