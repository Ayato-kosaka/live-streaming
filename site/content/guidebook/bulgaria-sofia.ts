import {
  BG_BASICS,
  BG_BUY,
  BG_EVENTS,
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

import { SOFIA_WENT } from "./bulgaria-sofia-went";
import { GUIDE_LABEL, GUIDE_TOPICS } from "./heading";
import type { Area, Fact, Guidebook, Guide, Item, Mark, MyMap, Pic, Place, Src, Todo } from "./types";

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
 * 狙う語: **ソフィア 観光／ブルガリア ヨーグルト／ブルガリア バラ／ソフィア 温泉**（2026-11-16 に Google のサジェストで
 * 引いた。「ソフィア 観光」の次に「日数」「おすすめ」、「ブルガリア バラ」に「香水」「薔薇ジャム」、「ソフィア 温泉」に「温泉水」
 * 「中央 温泉浴場」が出る）。競合は大手の観光まとめと、ユーロ導入前（2025年まで）の個人ブログ。こちらが勝つのは
 * 「2026年のユーロ建ての値段」と「やりたいことを窓1枚で、行き方・お金・コツまで」。
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
 * いまは**初めての人が見て面白いもの**を客観的に並べ、豚肉とアルコールは窓の中のアイコンで知らせるだけにする
 * （札と一覧には出さない。あやと 2026-11-16「豚・酒も私の好みに偏ってて微妙」。`docs/island-misses.md` #328）。
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
  "bnrnews.bg": "ブルガリア国営ラジオ",
  "www.across-magazine.com": "across",
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

type Shot = { img: string; thumb: string; cm: string; by: string; lic: string; alt: string };

/**
 * 借りた写真。**出どころの書けない写真は使わない**。絵は島の置き場（`/guide/bulgaria/sofia/photos/`）から配る
 * （`python/guide_photos.py` が Commons から落とす。作者・ライセンス・元のページは Commons のまま出す）
 */
function photo(s: Shot): Pic | undefined {
  if (!s.img || !s.cm || !s.lic) return undefined;
  return { src: s.img, small: s.thumb, alt: s.alt, kind: "photo", credit: { by: s.by, lic: s.lic, page: s.cm } };
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
 * エリアの札にしていたが、どんな街の地図では絵の縁の矢印（manifest の `beyond`）に出す（スコピエのヴォドノ山と同じ形。#1228）。
 *
 * Google マップの道は焼いたもの（`BG_SPOTS.maps`。`python/build_bulgaria.py` の `spot_maps` が
 * 「現地の字の名前＋街」で組む）をそのまま使う。ここで語を書き直さない（2か所で組むと片方だけ古くなる）。
 */
const SPOTS: Record<string, { id: string; area?: string }> = {
  "聖ゲオルギ教会（ロトンダ）": { id: "rotunda", area: "center" },
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
    /* 座標は材料（`content/bulgaria.ts` の `BG_SPOTS`）のまま。ここで書き写さない */
    geo: { lat: s.lat, lon: s.lon },
    ...(m.area ? { area: m.area } : {}),
    src: srcs(s.src, s.feesrc),
  };
});

// ---------------------------------------------------------------------------
// やりたいこと。**最大8。** 「ソフィアといえばこれ！」の、やってみたい体験（#1228。あやと 2026-11-16「ソフィア 60点」）
//
// 前の8つは名所の紹介だった（壁画の教会をはしご・地下鉄の改札の横のローマの街・ヴィトシャ大通り…）。いまは
// ミーハーでベタな欲求——本場のヨーグルト・バラのお土産・温泉・冬のマーケット——で選び直し、「行ってこれをしてきた！」
// と言える形にした（`docs/island-misses.md` #327）。前の名所（聖ゲオルギ教会・セルディカの遺跡・ヴィトシャ大通り・ボヤナ教会・
// ヴィトシャ山）は見たいものの窓にそのまま居る。
//
// **字は全部、調べた事実（`content/bulgaria.ts`）か、この下に出どころつきで持つ字から。** 作らない・推測で埋めない。

/** 料理・土産・イメージ・行事を名前で引く（無ければ書き出しを止める） */
const food = (jp: string) => must(BG_FOOD, (f) => f.jp.startsWith(jp), `料理「${jp}」`);
const gift = (what: string) => must(BG_BUY, (b) => b.what.startsWith(what), `土産「${what}」`);
const event = (what: string) => must(BG_EVENTS, (e) => e.what.startsWith(what), `行事「${what}」`);

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

/**
 * ソフィアのドイツ・クリスマスマーケット。**毎年開かれる場所と期間を、2つの出どころで確かめた**（2026-11-16）:
 * Sofia Globe（2025年11月の記事。市庭園・11月14日〜12月21日・15回目・街でいちばん古い・ホットワインと食べもの・手仕事の品・子どもの遊び）と、
 * ブルガリア国営ラジオ（同じ日の記事。市庭園・12月21日まで・食べものの屋台・ホットワイン・コンサートと劇）。
 * 2026年の日程はまだ出ていない（見つかったのは「前の年からの見込み」の字だけ）ので、年は2025年の実績として書く
 */
const XMAS_SRC = ["https://sofiaglobe.com/?p=125427", "https://bnrnews.bg/en/post/387631/sofias-city-garden-hosts-the-traditional-german-christmas-market"];

const yogurt = food("キセロ・ムリャコ");
const tarator = food("タラトル");
const banitsa = food("バニツァ");
const boza = food("ボザ");
const mehana = food("メハナ");
const shopska = food("ショプスカ");
const kebapche = food("ケバプチェ");
const gyuvech = food("ギュヴェチ");
const roseOil = gift("バラのオイル");
const roseJam = gift("ローズジャム");
const bath = spot("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口");
const joseph = spot("聖ヨシフ大聖堂");
const synagogue = spot("ソフィア・シナゴーグ");
const mosque = spot("バーニャ・バシ・モスク");
const nevsky = spot("アレクサンドル・ネフスキー大聖堂");
const theatre = spot("イヴァン・ヴァゾフ国立劇場と市庭園");
const rila = spot("リラ修道院（日帰り）");

const nedelya = spot("聖ネデリャ教会");

/** 札の印。**値段（`price`）と季節（`season`）だけ**——やりたいことの札は題がその街ならではの話なので、`local` は付けない */
const price = (text: string): Mark => ({ kind: "price", text });
const season = (text: string): Mark => ({ kind: "season", text });

const TODO: Todo[] = [
  {
    id: "yogurt",
    icon: "milk",
    title: "本場ブルガリアヨーグルト食べ比べたい！",
    catch: "酸っぱくて濃い“本物”を、牛・羊・水牛で",
    marks: [price("1個 1ユーロ前後")],
    lead: "明治ブルガリアヨーグルトの国。本場のヨーグルトは甘くない",
    pic: photo(yogurt),
    what: `ブルガリアのヨーグルトはキセロ・ムリャコ（кисело мляко＝酸っぱい乳）といって、甘くない。スーパーには牛・羊・水牛と乳の違うものが並び、水牛（биволско）のものが濃くて評判がいい。食堂の定番は、水で緩めたヨーグルトにきゅうり・にんにく・くるみを入れた冷たいスープ（タラトル）。日本の「明治ブルガリアヨーグルト」は、1972年にブルガリア政府から国名を使う許可を取って生まれた。`,
    how: `ヨーグルトはスーパーで（Lidl・Kaufland・Billa は、どれも中心部にある）。タラトルは食堂からメハナまで、どこにでもある。`,
    time: "",
    money: `スーパーで1個1ユーロ前後（約180円）。タラトルは店で2〜4ユーロ（約350〜700円）。`,
    tip: `砂糖やジャムは期待しない。向こうでは塩を振って食べ、冷たいスープやサラダ、肉料理のソースになる。`,
    route: `朝にスーパーで乳の違うものを買い、昼か夜の食堂でタラトルを前菜に頼む。`,
    see: [],
    eat: ["kiselo-mlyako", "tarator"],
    src: srcs(yogurt.src, image("ヨーグルト").src, tarator.src, basic("いちばん安いスーパー").src),
  },
  {
    id: "rose",
    icon: "flower",
    title: "バラの国でかわいいお土産を探したい！",
    catch: "ローズオイルに、花びらのジャム",
    marks: [price("ジャム 小瓶3ユーロから")],
    lead: "ブルガリアはバラのオイルの世界最大の産地",
    pic: photo(roseJam),
    what: `ブルガリアは、バラのオイル（розово масло）の世界最大の産地で、品質も最上級とされる。オイルやローズウォーターの小瓶のほか、バラの花びらをそのまま煮たジャムと、バラ風味の求肥菓子（ロクム）が、小瓶・小箱で配りやすい。`,
    when: `お土産はいつでも買える。バラの収穫と祭りは、カザンラクで毎年6月第1週（ソフィアの街なかにバラ畑は無い）。`,
    how: `オイルは市内のバラ専門店で。ジャムとロクムは、土産物屋かスーパーでも買える。`,
    time: "",
    money: `本物のオイルは小瓶で10ユーロ前後から（約1,800円〜）、ローズウォーターなら数ユーロ。ジャムは小瓶3〜6ユーロ（約530〜1,100円）。`,
    tip: `土産物屋の安い小瓶は、中身が怪しいことがある。本物のオイルは密封したガラス瓶に入っている。香りだけ持ち帰るなら、ローズウォーターのほうが安くて外れにくい。`,
    route: "",
    see: [],
    buy: ["rose-jam", "rose-oil"],
    src: srcs(image("バラの国").src, roseOil.src, roseJam.src, event("バラ祭り").src),
  },
  {
    id: "hotspring",
    icon: "hotspring",
    title: "街なかで湧く温泉にふれたい！",
    catch: "街の真ん中の蛇口から、温泉がただで湧いている",
    marks: [price("無料")],
    lead: "地元の人がポリタンクを持って並ぶ。街ができたのも、湯が出たからだとされる",
    pic: photo(bath),
    what: `${bath.what} 市内には49の鉱泉・温泉があり、街がここにできたのも、そもそも湯が出たからだとされる。`,
    how: bath.how,
    time: bath.stay,
    money: bath.fee,
    tip: bath.advice,
    route: `すぐ西のバーニャ・バシ・モスクも、同じ湯の上に建っている（名前はトルコ語で「たくさんの浴場」）。`,
    see: ["mineral-bath", "banya-bashi"],
    src: srcs(bath.src, bath.feesrc, mosque.src, history("温泉の上に建った街").src),
  },
  {
    id: "faiths",
    icon: "church",
    title: "教会・モスク・シナゴーグをはしごしたい！",
    catch: "4つの宗教の祈りの場が、歩いて数分の中に",
    marks: [price("教会とモスクは無料")],
    lead: "「寛容のトライアングル」と呼ばれる一角。足をのばせば金のドームの大聖堂",
    pic: photo(nevsky),
    what: `正教会の聖ネデリャ教会、ヨーロッパでも最古級の現役モスク（バーニャ・バシ・モスク、1566年ごろ）、南東ヨーロッパ最大のシナゴーグ（1909年開堂）、カトリックの聖ヨシフ大聖堂。違う宗教の祈りの場が歩いて数分の範囲に並んでいて、この一角は「寛容のトライアングル」と呼ばれる。東へ15分ほど歩けば、金のドームのアレクサンドル・ネフスキー大聖堂（1912年完成）。`,
    how: `聖ネデリャ教会は中心そのもの。聖ヨシフ大聖堂は中心から${joseph.walk.replace(/^中心から/, "")}、シナゴーグは${synagogue.walk.replace(/^中心から/, "")}、モスクは${mosque.walk.replace(/^中心から/, "")}。ネフスキー大聖堂だけ東へ離れていて、${nevsky.walk}（地下鉄 Св. Климент Охридски 駅から6分ほど）。`,
    time: `4つの見学で約${sumStay(["聖ネデリャ教会", "聖ヨシフ大聖堂", "ソフィア・シナゴーグ", "バーニャ・バシ・モスク"])}。ネフスキー大聖堂まで入れて約${sumStay(["聖ネデリャ教会", "聖ヨシフ大聖堂", "ソフィア・シナゴーグ", "バーニャ・バシ・モスク", "アレクサンドル・ネフスキー大聖堂"])}`,
    money: `本堂はどこも無料（モスクは礼拝の時間を外せば入れる）。シナゴーグは有料だが、いまの額は公式に載っていない（ユーロ導入前のガイドは5レフ＝約2.56ユーロ）。ネフスキー大聖堂の地下のイコン博物館は大人10.00ユーロ（約1,770円）・月曜休み。`,
    tip: `肩と膝を出さない服装で。モスクは入口で靴を脱ぎ、女性は髪を覆う布が要る（貸し出しがある）。シナゴーグは金曜の日没〜土曜に見学できない時間帯があり、入口はブロックの裏手。`,
    route: `聖ネデリャ教会 → 聖ヨシフ大聖堂 → シナゴーグ → モスクの順なら、戻らずに歩ける。モスクの向かいは温泉の蛇口。ネフスキー大聖堂まで足をのばすなら、隣は街の名前の由来になった6世紀の聖ソフィア教会。`,
    see: ["nedelya", "st-joseph", "synagogue", "banya-bashi", "nevsky", "sveta-sofia"],
    src: srcs(history("寛容のトライアングル").src, nedelya.src, nedelya.feesrc, joseph.src, joseph.feesrc, synagogue.src, synagogue.feesrc, mosque.src, mosque.feesrc, nevsky.src, nevsky.feesrc, spot("聖ソフィア教会").src),
  },
  {
    id: "mehana",
    icon: "eat",
    title: "伝統料理の店メハナでおなかいっぱい食べたい！",
    catch: "国旗の色のサラダから始めて、土鍋の煮込みまで",
    marks: [price("主菜 8〜13ユーロ")],
    lead: "木の内装に、刺繍の飾り。家族経営の食堂兼居酒屋",
    pic: photo(shopska),
    what: `メハナは、家族経営の食堂兼居酒屋。木を基調にした内装に、その地方の工芸品や刺繍が飾られている。食事はだいたい、トマト・きゅうりに白いチーズを雪のように削ってかけたショプスカ・サラダ（色が国旗と同じ白・緑・赤）から始まる。陶器で煮込んだ料理（ギュヴェチなど）が得意。`,
    how: `ソフィアでは、修道院のレシピを出す Manastirska Magernitsa、品数の多い Hadjidraganovite Izbi、1926年築の文化財の Pod Lipite がよく名前の挙がる店。`,
    time: "",
    money: `主菜で8〜13ユーロ（約1,400〜2,300円）。ショプスカ・サラダは4〜6ユーロ（約700〜1,100円）前後。`,
    tip: `炭火焼き（ケバプチェ）は、スカラ（скара）専門の小さな店の焼きたてのほうが確実。豚の焼き物も煮込みも並ぶので、豚や酒を避ける人は品ごとに確かめる。`,
    route: "",
    see: [],
    eat: ["mehana", "shopska-salata", "gyuvech", "kebapche"],
    src: srcs(mehana.src, shopska.src, gyuvech.src, kebapche.src),
  },
  {
    id: "banitsa",
    icon: "bread",
    title: "朝はパン屋で焼きたてのバニツァを食べたい！",
    catch: "チーズのパイに、甘酸っぱいボザ。これが地元の朝ごはん",
    marks: [price("1〜2ユーロ")],
    lead: "ペカルナ（パン屋）ならどこでも。朝の焼きたてを狙う",
    pic: photo(banitsa),
    what: `薄いパイ生地に白チーズと卵を挟んで焼いたバニツァは、朝の定番。長ネギ入り、かぼちゃ入り（тиквеник）などがある。これに、小麦やキビを発酵させた、とろりと甘酸っぱい飲みもののボザを合わせるのが地元の朝食。`,
    how: `ソフィアでは、Rainbow Factory、Furna（ステファン・スタンボロフ大通り脇。ボザもある）、ヴィトシャ大通り近くの Sweet and Salty がよく名前の挙がる店。`,
    time: "",
    money: `バニツァはパン屋で1〜2ユーロ（約180〜350円）。ボザも1〜2ユーロ（約180〜350円）。`,
    tip: `ボザはふつう0.5〜1.0%の微量のアルコールを含み、完全なノンアルコールではない。好き嫌いが割れる味。バニツァは店によって中身が違い、挽き肉やハム入りもあるので、肉を避けるなら焼き台の札を見る。`,
    route: "",
    see: [],
    eat: ["banitsa", "boza"],
    src: srcs(banitsa.src, banitsa.meatsrc, boza.src, boza.meatsrc),
  },
  {
    id: "xmas",
    icon: "pine",
    title: "冬はクリスマスマーケットでホットワインを飲みたい！",
    catch: "国立劇場の前の庭園に、クリスマスマーケットが立つ",
    marks: [season("冬だけ")],
    lead: "毎年11月中旬から。ソフィアでいちばん古いクリスマスマーケット",
    what: `イヴァン・ヴァゾフ国立劇場の前の市庭園（アレクサンダル・バッテンベルク広場）に立つ、ドイツ・クリスマスマーケット。ホットワインと食べもの、手仕事の品の店、子どもの遊びがあり、コンサートや劇も開かれる。2025年で15回目の、ソフィアでいちばん古いクリスマスマーケット。`,
    when: `毎年11月中旬〜12月下旬。2025年は11月14日〜12月21日。開く日は毎年動くので、行く年の告知を確かめる。`,
    how: `市庭園は、中心（聖ネデリャ教会）から${theatre.walk.replace(/^中心から/, "")}。`,
    time: "",
    money: `市庭園に入るのは無料。ホットワインや食べものの値段は、出どころの記事に載っていない。`,
    tip: `ホットワインはアルコール入り。11月でも朝晩は氷点下近くまで冷えるので、上着は厚めに。`,
    route: `市庭園から東へ歩くと、金のドームと緑の尖塔のロシア教会、その先にネフスキー大聖堂。`,
    see: ["national-theatre", "russian-church", "nevsky"],
    src: srcs(...XMAS_SRC, theatre.feesrc, basic("11月の気候と服装").src, spot("ロシア教会（奇蹟者聖ニコライ聖堂）").src),
  },
  {
    id: "rila",
    icon: "church",
    title: "世界遺産のリラ修道院へ日帰りで行きたい！",
    catch: "山あいに、縞模様のアーチと極彩色のフレスコ",
    marks: [price("中庭と本堂は無料")],
    lead: "ソフィアから南へ約120km。ブルガリア最大の修道院",
    pic: photo(rila),
    what: rila.what,
    how: `${rila.how}（${rila.walk}）`,
    time: rila.stay,
    money: rila.fee,
    tip: rila.advice,
    route: `移動を含めて丸1日。ほかの予定と同じ日に入れない。`,
    see: ["rila"],
    src: srcs(rila.src, rila.feesrc),
  },
];

if (TODO.length > 8) throw new Error("content/guidebook/bulgaria-sofia.ts: やりたいことは最大8（#1228）");
/* 印は短く（札の上の字を少なく）。12字を超える印は、狭い画面で札の幅いっぱいに伸びて題とぶつかる */
for (const t of TODO)
  for (const m of t.marks ?? [])
    if ([...m.text].length > 12) throw new Error(`content/guidebook/bulgaria-sofia.ts: やりたいこと「${t.id}」の印が12字を超える（${m.text}）`);

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
 *
 * **名前は、日本語のガイドがその一帯を呼んでいる字**（#1228 の軸 A。`docs/guide-copy.md` 5章）。ソフィアは
 * 地球の歩き方でも街の中を分けた見出しが無いので、全部「目印＋周辺」。出どころは頼み書き
 * （`.claude/skills/chatgpt-image/guide/bulgaria/sofia.json` の `areamap.areas[].source` の1本目）。
 * **地図の絵に名前と色を焼いてある**（#1262）。名前か色を変えたら `guide_art.py finalize` で焼き直す
 * （食い違うと `SpotMap.tsx` が書き出しを止める）。地図の札は短く、ここは正式な名前（地図の下の一覧と窓に出る）
 */
const AREAS_BASE: Omit<Area, "see" | "src">[] = [
  {
    id: "center",
    plan: [2, 1, 1],
    name: "セルディカ駅周辺",
    color: "#bdb8f2",
    lead: "ローマの石畳と湧き出る温泉",
    body: "地下鉄セルディカ駅のまわり。2世紀の通りと城壁が改札の横に出ていて、4世紀の聖ゲオルギ教会・温泉の蛇口・モスクが歩いて数分の中に並ぶ。見どころの多くはここから歩いて回れる。",
  },
  {
    id: "market",
    plan: [1, 1, 1],
    name: "ジェンスキー・パザール周辺",
    color: "#f7a9c4",
    lead: "街でいちばん古い青空市場",
    body: "1878年に始まった青空市場（女性市場）は、土産物ではなく、街の人が野菜や果物を買いに来る所。1911年の屋内市場の建物（中央市場ホール）には、2024年からスーパーが入っている。南東ヨーロッパ最大のシナゴーグとカトリックの大聖堂もこの一角。",
  },
  {
    id: "nevsky",
    plan: [3, 1, 1],
    name: "アレクサンドル・ネフスキー大聖堂周辺",
    color: "#8fd6d8",
    lead: "金のドームと街の名前になった教会",
    body: "金のドームのアレクサンドル・ネフスキー大聖堂と、街の名前の由来になった6世紀の聖ソフィア教会が隣どうし。西へ戻ると、金のドームと緑の尖塔のロシア教会。国立劇場の前の市庭園は、市内でいちばん古い公園（1872年）。",
  },
  {
    id: "south",
    plan: [2, 2, 2],
    name: "ヴィトシャ通り周辺",
    color: "#ffd76e",
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

/**
 * どんな街の問いと答え（#1228。あやと 2026-11-16「どんな街の大きな数字は AI 臭い。『歴史は？』のように簡単に説明する」）。
 *
 * **問いは2つ: 歴史と雰囲気。** その街が日本語のガイドで何で語られているかで選ぶ（あやと 2026-11-18「お金と言葉は基本情報に
 * 書いてあるので要らない」「その街が何で知られているかで」）。地球の歩き方のソフィアの記事は街を「ヨーロッパ最古の都市のひとつで、
 * 7,000年以上の歴史があり、歴史的建造物や古代ローマ時代の遺跡などが多く残っています」と紹介し（歴史）、観光の中心を
 * 「地下鉄セルディカ駅からソフィア大学駅にかかる一帯」とまとめる（歩いて回れる小ささ＝雰囲気）。
 * 前の「お金は？」「言葉は？」は基本情報（通貨・ひとこと現地語）と同じ話だったので外した
 *
 * 前は大きい数（「前7000年ごろから」「1879年に首都」「49の温泉」「4つの宗教」）の札と、「よく言われること」
 * （標語・ヨーグルト・安い・バラ）の札だった。ヨーグルトとバラはやりたいことに入れ、標語は外した。
 * **答えは調べた事実の字をつないだもの**で、数字と固有名は材料どおり（`docs/island-misses.md` #327）。
 */
const ABOUT: Guidebook["about"]["cards"] = [
  {
    id: "history",
    icon: "ruins",
    q: "歴史は？",
    a: `古代の名はセルディカ。ローマ皇帝が「我がローマ」と呼んだと伝わる街で、500年近いオスマン帝国の時代を経て、1879年にブルガリアの首都になった。`,
    src: srcs(history("もとの名前は「セルディカ」").src, history("500年のオスマン支配と、1879年の首都").src),
  },
  {
    id: "mood",
    icon: "oldtown",
    q: "どんな雰囲気？",
    a: `見どころの多くは、中心から歩いて15分の中。地下鉄の改札の脇にローマ時代の石畳が出ていて、大通りの先にはヴィトシャ山が見える。`,
    src: srcs(spot("アレクサンドル・ネフスキー大聖堂").src, spot("古代セルディカ遺跡（ラルゴの地下）").src, spot("ヴィトシャ大通り（歩行者区間）").src),
  },
];
/* 問いは短く。15字まで・「？」で終わる（スコピエの焼く道具と同じ決まり。`python/guidebook_bake.py` の `about`） */
for (const c of ABOUT)
  if ([...c.q].length > 15 || !c.q.endsWith("？")) throw new Error(`content/guidebook/bulgaria-sofia.ts: どんな街の問い「${c.q}」は15字まで・「？」で終わる`);

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

/**
 * 札の印のうち「ブルガリアならでは」（`local`）。**ヨーグルトとバラだけ**（あやと 2026-11-16「『ヨーグルト』とか『薔薇』とか
 * ブルガリアならではのチップならまだわかる」）。中身の事実（ヨーグルトが入る・バラから作る）は、それぞれの窓の字と出どころにある
 */
const LOCAL: Record<string, string> = {
  "kiselo-mlyako": "ヨーグルト",
  tarator: "ヨーグルト",
  ayryan: "ヨーグルト",
  "rose-oil": "バラ",
  "rose-jam": "バラ",
};
const localMarks = (id: string): Mark[] | undefined => (LOCAL[id] ? [{ kind: "local", text: LOCAL[id] }] : undefined);

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
    marks: localMarks(id),
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
  "白チーズとカシュカヴァル": "cheese",
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
    marks: localMarks(id),
    flags: { alcohol: b.alcohol },
    src: srcs(b.src),
  };
});

/* やりたいこと → 食べたいもの・買いたいもの の繋ぎ。名前を打ち間違えた札を、黙って落とさない */
{
  const miss = Object.keys(LOCAL).filter((id) => !EAT.some((x) => x.id === id) && !BUY.some((x) => x.id === id));
  if (miss.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: ブルガリアならではの印が、無い品を指している（${miss.join("、")}）`);
}
{
  const eat = new Set(EAT.map((x) => x.id));
  const buy = new Set(BUY.map((x) => x.id));
  const bad = TODO.flatMap((t) => [
    ...(t.eat ?? []).filter((id) => !eat.has(id)).map((id) => `${t.id}→食べたいもの ${id}`),
    ...(t.buy ?? []).filter((id) => !buy.has(id)).map((id) => `${t.id}→買いたいもの ${id}`),
  ]);
  if (bad.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: やりたいことが無い品を指している（${bad.join("、")}）`);
}

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
      text: "見どころの多くは無料。聖ゲオルギ教会・セルディカの地下通路・ネフスキー大聖堂の本堂・温泉の蛇口は、1円もかからない。",
      src: srcs(
        spot("聖ゲオルギ教会（ロトンダ）").feesrc,
        spot("古代セルディカ遺跡（ラルゴの地下）").feesrc,
        spot("アレクサンドル・ネフスキー大聖堂").feesrc,
        spot("中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口").feesrc,
      ),
    },
    { text: "1日に何度も乗るなら1日券（2.00ユーロ・約350円）。1回券は0.80ユーロ（約140円）。", src: srcs(b("市内の移動").src) },
    {
      text: "スーパーは Lidl・Kaufland・Billa。野菜と果物は、スーパーより青空市場（女性市場）のほうが安い。",
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
// 行った（肉付け）

/**
 * あやとが行った所・食べたもの（2026-11-13〜。`docs/guide-design.md` ★1）。行った項目に「行った」の印と、窓の中の
 * 「あやとの旅の記録」（その日のあやと島カード・短い話・配信の場面）が乗る。**字・場面の秒・写真は焼いたもの**
 * （`./bulgaria-sofia-went.ts`。元は `python/data/guide/bulgaria/sofia/went.json` と配信の facts。焼くのは
 * `python/guidebook_went.py`）。ここでは id で当てるだけ。**骨組みは消さない**——行っていない所もそのまま並ぶ。
 * **札の絵は替えない**（カードは窓の中の箱に。札の絵の決めかたは `./manifest.ts` の `dress`）
 */
function wear(sec: "todo" | "see" | "eat" | "buy", xs: (Item | Todo)[]): void {
  for (const x of xs) {
    const w = SOFIA_WENT.items[`${sec}/${x.id}`];
    if (w) x.went = w.went;
  }
}
wear("todo", TODO);
wear("see", SEE);
wear("eat", EAT);
wear("buy", BUY);
/* 名前を打ち間違えた「行った」を、黙って落とさない */
{
  const ids = new Set([
    ...TODO.map((x) => `todo/${x.id}`),
    ...SEE.map((x) => `see/${x.id}`),
    ...EAT.map((x) => `eat/${x.id}`),
    ...BUY.map((x) => `buy/${x.id}`),
  ]);
  const miss = Object.keys(SOFIA_WENT.items).filter((k) => !ids.has(k));
  if (miss.length) throw new Error(`content/guidebook/bulgaria-sofia.ts: 「行った」が無い項目を指している（${miss.join("、")}）`);
}

/** 手で書いた中身の最終更新。行った箱の最終更新（焼いた日）と遅いほうを面に出す */
const UPDATED = "2026-11-18";

// ---------------------------------------------------------------------------

const hero = photo(BG_HERO);
if (!hero) throw new Error("content/guidebook/bulgaria-sofia.ts: 表紙の写真（BG_HERO）が無い");

export const SOFIA: Guidebook = {
  country: "bulgaria",
  city: "sofia",
  name: "ソフィア",
  kicker: "ブルガリア",
  local: { text: "София", lang: "bg", roman: "Sofia" },
  /* キャッチはあやとが7案から選んだ3番（#1228 2026-11-17）。島の紙（`components/isle/spec.ts`）と目録（`content/directory.ts`）も同じ字 */
  lead: "二千年の歴史が足もとに眠る街",
  cover: hero,
  /* 題は「ソフィア観光ガイド」が頭（あやと 2026-11-18 #1228「この面は『やりたいこと8選』の面ではない」。字は `./heading.ts`）。
     主な意図「ソフィア 観光」は頭に残し、検索結果で見える30字前後に「観光ガイド【2026年】見どころマップ」まで入れる。
     前の「ソフィア観光でやりたいこと8選【2026年・地図付き】」は、面の1節（やりたいこと）の名前で題を立てていた。
     「ブルガリア」は外さない（「ソフィア 見どころ」の候補にアヤソフィアが混ざる。#1262 の2章）。
     一文は「観光ガイド」と「見どころマップ」を1回ずつ（検索結果で打った語が太字になる）。やりたいことは数を言っても「◯選」と書かない */
  title: `ソフィア${GUIDE_LABEL}【2026年】${GUIDE_TOPICS}｜ブルガリア`,
  description: `ブルガリアの首都ソフィアの観光ガイド。見どころマップと、やりたいこと${TODO.length}つ（本場ヨーグルトの食べ比べ、バラのお土産、街なかで湧く無料の温泉、冬のクリスマスマーケット、世界遺産リラ修道院への日帰り）、名物料理とお土産、2026年のユーロの値段まで。`,
  published: "2026-11-06",
  updated: SOFIA_WENT.updated > UPDATED ? SOFIA_WENT.updated : UPDATED,
  rate: RATE,
  about: { cards: ABOUT, areas: AREAS },
  todo: TODO,
  see: { items: SEE, map: mymap("see"), far: FAR },
  eat: { kinds: KINDS, items: EAT, places: PLACES.filter((p) => BG_FOOD.some((f) => placeIds(f.pins).includes(p.id))), map: mymap("eat") },
  buy: { items: BUY, places: PLACES.filter((p) => BG_BUY.some((x) => placeIds(x.pins).includes(p.id))), map: mymap("buy") },
  /* ソフィアのショートはまだ無い（`content/shorts.ts` に「ブルガリア」「ソフィア」の題の回が無い。2026-11-19 に見直した）。
     行った項目の動画は ② 配信の場面だけ（ショートができたら `went.json` の項目に `short` を足す）。
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
