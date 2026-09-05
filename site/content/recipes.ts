/**
 * クッキング配信で作ってきた料理のスタンプ帳。
 * クッキングは「企画会議 → 買い出し → 調理」の3日構成が基本なので、
 * 関係する配信をまとめて `streams` に持つ。
 */
export type RecipeStream = { label: "企画会議" | "買い出し" | "調理" | "リベンジ" | "配信"; date: string; videoId: string; title: string };

/**
 * どんな料理か。
 *
 * 国だけで絞ると、25品がジョージアに固まっていて絞り込みの意味がない。
 * 「粉もの続きの週」「イワシで3日」のような、実際にあったかたよりは
 * 国ではなく料理の種類のほうに出るので、こちらの軸を足した。
 */
export type RecipeKind = "rice" | "meat" | "fish" | "flour" | "soup" | "side" | "sweet";

export const KINDS: { id: RecipeKind; label: string }[] = [
  { id: "rice", label: "ごはん・麺" },
  { id: "flour", label: "粉もの" },
  { id: "meat", label: "肉" },
  { id: "fish", label: "魚" },
  { id: "soup", label: "汁もの" },
  { id: "side", label: "副菜" },
  { id: "sweet", label: "甘いもの" },
];

export const kindLabel = (k: RecipeKind) => KINDS.find((x) => x.id === k)?.label ?? k;

export type Recipe = {
  slug: string;
  name: string;
  emoji: string;
  /**
   * スタンプに使うスプライト名（`site/public/sprites` の `food-*`。一覧は `content/sprites.json`）。
   *
   * **1品につき1枚。同じ絵を2品で使わない。** スタンプ帳は「押した数だけ違う絵が並ぶ」から
   * 図鑑に見える。同じ皿が2つ並んだ瞬間、絵ではなく飾りになる。
   * food-* は105枚あるので、料理が増えても使い回す理由はない。
   */
  icon: string;
  country: string; // countries.slug
  kind: RecipeKind;
  date: string; // 完成した日
  note: string;
  streams: RecipeStream[];
};

export const RECIPES: Recipe[] = [
  {
    slug: "egg-sandwich",
    name: "卵サンド",
    emoji: "🥪",
    icon: "food-sandwich",
    country: "uk",
    kind: "flour",
    date: "2025-02-03",
    note: "チェスターのホステルにコンロが無かったので、卵サンドで乗り切った回。",
    streams: [{ label: "調理", date: "2025-02-03", videoId: "u9jY4KyIHKQ", title: "キッチンにコンロ無かったけど、卵サンド食べてみた" }],
  },
  {
    slug: "roast-chicken",
    name: "丸鶏ロースト",
    emoji: "🍗",
    icon: "food-turkey",
    country: "uk",
    kind: "meat",
    date: "2025-02-10",
    note: "イギリスの鶏を丸ごと焼いた。ここからクッキング配信が本格化した。",
    streams: [
      { label: "買い出し", date: "2025-02-09", videoId: "5_zIl5EvcMo", title: "イギリスで鶏肉買いにいこー" },
      { label: "調理", date: "2025-02-10", videoId: "5D_7RU9cX8A", title: "イギリス鶏、丸ごと焼いたので食べていきまーす！" },
    ],
  },
  {
    slug: "tortilla",
    name: "トルティーヤ",
    emoji: "🌯",
    icon: "food-taco",
    country: "belgium",
    kind: "flour",
    date: "2025-03-26",
    note: "リエージュで。スネちゃまの誕生日をお祝いしながら作った。",
    streams: [{ label: "調理", date: "2025-03-26", videoId: "mnI9zAyPBTU", title: "ベルギー🇧🇪リエージュでトルティーヤを作りました" }],
  },
  {
    slug: "garlic-tomato",
    name: "ニンニクましましましましましトマト",
    emoji: "🍅",
    icon: "food-tomato",
    country: "azerbaijan",
    kind: "side",
    date: "2025-07-06",
    note: "名前がそのまま料理名になった一品。ましが5回。",
    streams: [{ label: "調理", date: "2025-07-06", videoId: "9Q1ghbbZDqs", title: "アゼルバイジャン🇦🇿でニンニクましましましましましトマト作りました" }],
  },
  {
    slug: "az-salad",
    name: "アゼルバイジャン風サラダ",
    emoji: "🥗",
    icon: "food-salad",
    country: "azerbaijan",
    kind: "side",
    date: "2025-07-16",
    note: "現地の食べ方を真似して作ったサラダ。",
    streams: [{ label: "調理", date: "2025-07-16", videoId: "MS6fQfPDsDo", title: "アゼルバイジャン🇦🇿風サラダ作りました" }],
  },
  {
    slug: "az-curry",
    name: "アゼルバイジャン風チキン無水スパイスカレー",
    emoji: "🍛",
    icon: "food-pot-stew",
    country: "azerbaijan",
    kind: "soup",
    date: "2025-07-17",
    note: "水を使わないカレー。スパイスは現地のマーケットで揃えた。",
    streams: [{ label: "調理", date: "2025-07-17", videoId: "_0MiXG6Qwsw", title: "アゼルバイジャン🇦🇿風チキン無水スパイスカレー作りました" }],
  },
  {
    slug: "gyoza",
    name: "水餃子",
    emoji: "🥟",
    icon: "food-dim-sum",
    country: "georgia",
    kind: "rice",
    date: "2025-07-22",
    note: "皮から作った水餃子。ジョージアにはヒンカリという似た料理がある。",
    streams: [{ label: "調理", date: "2025-07-22", videoId: "YkGHXQywuUE", title: "ジョージア🇬🇪で水餃子作りました" }],
  },
  {
    slug: "carbonara",
    name: "カルボナーラ",
    emoji: "🍝",
    icon: "food-plate-dinner",
    country: "georgia",
    kind: "rice",
    date: "2025-08-05",
    note: "買い出しと調理を2日に分けた、いまの3日構成の原型。",
    streams: [
      { label: "買い出し", date: "2025-08-04", videoId: "aL_ApWXgWoM", title: "カルボナーラの具材買いに行こ！" },
      { label: "調理", date: "2025-08-05", videoId: "GIyGaIhXt2M", title: "カルボナーラつくろぞーー" },
    ],
  },
  {
    slug: "russian-soup",
    name: "ロシア風鶏野菜スープ",
    emoji: "🍲",
    icon: "food-bowl-soup",
    country: "georgia",
    kind: "soup",
    date: "2025-10-13",
    note: "「作ってみたい」から翌日に実際に作った回。",
    streams: [
      { label: "企画会議", date: "2025-10-12", videoId: "JhnGIj_w3Is", title: "ロシア風野菜スープとやらを作ってみたい！" },
      { label: "調理", date: "2025-10-13", videoId: "fguIWqpU7xA", title: "【雑談】ロシア風鶏野菜スープができました" },
    ],
  },
  {
    slug: "kebab",
    name: "ケバブ",
    emoji: "🥙",
    icon: "food-skewer",
    country: "georgia",
    kind: "meat",
    date: "2026-02-17",
    note: "バトゥミ最終日の深夜に作った。",
    streams: [{ label: "調理", date: "2026-02-17", videoId: "hnVwWLDS6B8", title: "ケバブ作る" }],
  },
  {
    slug: "shkmeruli-pasta",
    name: "シュクメルリパスタ",
    emoji: "🧄",
    icon: "food-tajine",
    country: "georgia",
    kind: "rice",
    date: "2026-04-17",
    note: "1回目は失敗した。翌日リベンジして大食いした、珍しい2部作。",
    streams: [
      { label: "調理", date: "2026-04-16", videoId: "K3Ox6Yf0LWc", title: "【失敗】シュクメルリパスタ作って大食いして見た" },
      { label: "リベンジ", date: "2026-04-17", videoId: "xTRLyM9Pzxg", title: "今度こそシュクメルリパスタ作って大食いして見た" },
    ],
  },
  {
    slug: "tomato-chicken-rice",
    name: "トマトチキンライス",
    emoji: "🍚",
    icon: "food-pan-stew",
    country: "armenia",
    kind: "rice",
    date: "2026-05-16",
    note: "アルメニアの宿のキッチンで。",
    streams: [{ label: "調理", date: "2026-05-16", videoId: "AZwmL3H25TA", title: "アルメニアでトマトチキンライス作ります" }],
  },
  {
    slug: "french-toast",
    name: "ジョージア風フレンチトースト",
    emoji: "🍞",
    icon: "food-bread",
    country: "georgia",
    kind: "flour",
    date: "2026-05-25",
    note: "材料探しにマーケットへ行くところから3本立てになった回。",
    streams: [
      { label: "買い出し", date: "2026-05-24", videoId: "nzf06yFqIkk", title: "ジョージア風フレンチトーストの材料探しにマーケットいきます" },
      { label: "調理", date: "2026-05-25", videoId: "_Azl32caALw", title: "ジョージア風フレンチトースト作るで！" },
    ],
  },
  {
    slug: "az-pilaf",
    name: "アゼルバイジャン風ピラフ",
    emoji: "🍛",
    icon: "food-bowl-cereal",
    country: "georgia",
    kind: "rice",
    date: "2026-06-02",
    note: "アゼルバイジャンで食べた味を、ジョージアで再現した。",
    streams: [{ label: "調理", date: "2026-06-02", videoId: "A-gx1RqF0Cg", title: "アゼルバイジャン風ピラフ作ります！" }],
  },
  {
    slug: "okonomiyaki",
    name: "ジョージア風お好み焼き",
    emoji: "🥞",
    icon: "food-pancakes",
    country: "georgia",
    kind: "flour",
    date: "2026-06-12",
    note: "ソースから自作した。前日にソース作りの回がある。",
    streams: [
      { label: "買い出し", date: "2026-06-11", videoId: "SuG4RSzvQ0U", title: "ジョージア風お好み焼きソース作ろうか！" },
      { label: "調理", date: "2026-06-12", videoId: "7msFTwtmLrE", title: "ジョージア風お好み焼きを作ります！" },
    ],
  },
  {
    slug: "tempura",
    name: "ジョージア風天ぷら",
    emoji: "🍤",
    icon: "food-fries",
    country: "georgia",
    kind: "side",
    date: "2026-06-19",
    note: "企画会議から始まった天ぷら。",
    streams: [
      { label: "企画会議", date: "2026-06-17", videoId: "tKLZa989tCs", title: "ジョージア風天ぷらの企画会議や" },
      { label: "調理", date: "2026-06-19", videoId: "Q3f5230slnk", title: "ジョージアで天ぷら作ります" },
    ],
  },
  {
    slug: "kamatama-udon",
    name: "ジョージア風釜玉チーズうどん",
    emoji: "🍜",
    icon: "food-bowl-broth",
    country: "georgia",
    kind: "rice",
    date: "2026-06-26",
    note: "麺から打った。ジョージアのチーズと合わせた変化球。",
    streams: [
      { label: "買い出し", date: "2026-06-25", videoId: "baIpMjZRFpE", title: "ジョージアでうどんの麺作ります" },
      { label: "調理", date: "2026-06-26", videoId: "p6dOZMX2lAE", title: "ジョージア風釜玉チーズうどん作ります" },
    ],
  },
  {
    slug: "compote",
    name: "ジョージア風コンポート",
    emoji: "🍑",
    icon: "food-cherries",
    country: "georgia",
    kind: "sweet",
    date: "2026-07-02",
    note: "タイトルが「ジョジアデコンポトツクル」だった回。",
    streams: [{ label: "調理", date: "2026-07-02", videoId: "pcATx8Qq4s8", title: "ジョジアデコンポトツクル" }],
  },
  {
    slug: "galette",
    name: "ジョージア風ガレット",
    emoji: "🥞",
    icon: "food-waffle",
    country: "georgia",
    kind: "flour",
    date: "2026-07-03",
    note: "翌日のクレープと合わせて2日連続の粉物。",
    streams: [{ label: "調理", date: "2026-07-03", videoId: "4uICARYwXbY", title: "ジョージア風ガレット作ります！" }],
  },
  {
    slug: "crepe",
    name: "ジョージア風クレープ",
    emoji: "🥐",
    icon: "food-croissant",
    country: "georgia",
    kind: "flour",
    date: "2026-07-04",
    note: "ガレットの翌日。甘い方。",
    streams: [{ label: "調理", date: "2026-07-04", videoId: "zQJSiKL0D3U", title: "ジョージア風クレープ作ります！" }],
  },
  {
    slug: "korokke",
    name: "ジョージア風コロッケ",
    emoji: "🥔",
    icon: "food-meat-patty",
    country: "georgia",
    kind: "side",
    date: "2026-07-09",
    note: "たねを作る日と揚げる日で分けた。",
    streams: [
      { label: "買い出し", date: "2026-07-08", videoId: "I5O7KhOAuV0", title: "ジョージア風コロッケのたねつくる" },
      { label: "調理", date: "2026-07-09", videoId: "e-UXOUdzTLU", title: "ジョージア風コロッケの作るで！" },
    ],
  },
  {
    slug: "nanban-5",
    name: "ジョージア風南蛮漬け5種",
    emoji: "🐟",
    icon: "food-plate-deep",
    country: "georgia",
    kind: "fish",
    date: "2026-07-16",
    note: "タレを作る日、漬ける日、食べる日の3日がかり。5種類を食べ比べた。",
    streams: [
      { label: "企画会議", date: "2026-07-14", videoId: "uTgvBEi0FsM", title: "ジョージア風南蛮漬け5種のタレ作ります" },
      { label: "買い出し", date: "2026-07-15", videoId: "yftA1HCSLiQ", title: "ジョージア風南蛮漬け5種の浸けます！" },
      { label: "調理", date: "2026-07-16", videoId: "c6FFPcY8Tac", title: "ジョージア風南蛮漬け5種をついに食べます！" },
    ],
  },
  {
    slug: "iwashi-hiyashi",
    name: "イワシの冷やし中華",
    emoji: "🍜",
    icon: "food-chinese",
    country: "georgia",
    kind: "rice",
    date: "2026-07-22",
    note: "「ジョージアイワシ祭り」3連戦の1日目。",
    streams: [
      { label: "企画会議", date: "2026-07-21", videoId: "n-BJIqSuH9M", title: "ジョージアでクッキング企画会議や！" },
      { label: "調理", date: "2026-07-22", videoId: "lAzVgZ_DdTw", title: "ジョージアでイワシの冷やし中華作ります！" },
    ],
  },
  {
    slug: "iwashi-shioyaki",
    name: "イワシの塩焼き",
    emoji: "🐟",
    icon: "food-fish",
    country: "georgia",
    kind: "fish",
    date: "2026-07-23",
    note: "イワシ祭り2日目。いちばんシンプルな食べ方。",
    streams: [{ label: "調理", date: "2026-07-23", videoId: "SQXQOF1_Qhg", title: "ジョージアでイワシの塩焼き作ります！" }],
  },
  {
    slug: "iwashi-paella",
    name: "イワシのパエリア",
    emoji: "🥘",
    icon: "food-pan",
    country: "georgia",
    kind: "rice",
    date: "2026-07-24",
    note: "イワシ祭り最終日。3日間イワシを食べ続けた。",
    streams: [{ label: "調理", date: "2026-07-24", videoId: "EjRXQuzubLo", title: "ジョージアイワシ祭り最終日！イワシのパエリア作ります！" }],
  },
  {
    slug: "tamagoyaki",
    name: "卵焼きと酢の物",
    emoji: "🍳",
    icon: "food-egg-cooked",
    country: "georgia",
    kind: "side",
    date: "2026-07-30",
    note: "翌日の唐揚げ定食の副菜を先に作った回。",
    streams: [{ label: "調理", date: "2026-07-30", videoId: "Z0AI9LY0Z2U", title: "卵焼きと酢の物つくろーー！" }],
  },
  {
    slug: "karaage-teishoku",
    name: "唐揚げ定食",
    emoji: "🍱",
    icon: "food-plate-sauerkraut",
    country: "georgia",
    kind: "meat",
    date: "2026-07-31",
    note: "「本気のクッキング」と銘打った定食一式。",
    streams: [{ label: "調理", date: "2026-07-31", videoId: "ZcchwhRE_Ks", title: "本気のクッキングや！！唐揚げ定食つくるぞ！！" }],
  },
  {
    slug: "acqua-pazza",
    name: "アクアパッツァ",
    emoji: "🐠",
    icon: "food-frying-pan",
    country: "georgia",
    kind: "fish",
    date: "2026-08-07",
    note: "カズベキの山の宿で作った。買い出しの日から2日がかり。",
    streams: [
      { label: "買い出し", date: "2026-08-06", videoId: "jwh1FeaQwzE", title: "カズベキでアクアパッツァの材料買います" },
      { label: "調理", date: "2026-08-07", videoId: "dkmw3DHDMX4", title: "カズベキでアクアパッツァつくるぞー！" },
    ],
  },
  {
    slug: "margherita",
    name: "マルゲリータピザ",
    emoji: "🍕",
    icon: "food-pizza",
    country: "georgia",
    kind: "flour",
    date: "2026-08-14",
    note: "生地から。買い出しの日も配信した。",
    streams: [
      { label: "買い出し", date: "2026-08-13", videoId: "mXs3RCOS1JQ", title: "マルゲリータピザの材料買いに行こ" },
      { label: "調理", date: "2026-08-14", videoId: "9WpNkeeUWs0", title: "マルゲリータピザのつくるぞ！！" },
    ],
  },
  {
    slug: "german-potato",
    name: "ジョージア風ジャーマンポテト",
    emoji: "🥔",
    icon: "food-bacon",
    country: "georgia",
    kind: "side",
    date: "2026-08-19",
    note: "「どーやってつくろ」から始まった回。",
    streams: [{ label: "調理", date: "2026-08-19", videoId: "aymUG1Q0Kec", title: "ジョージア風ジャーマンポテトどーやってつくろ！" }],
  },
  {
    slug: "fruit-juice",
    name: "ジョージア風フルーツジュース",
    emoji: "🧃",
    icon: "food-soda-glass",
    country: "georgia",
    kind: "sweet",
    date: "2026-08-20",
    note: "市場のフルーツを絞った。",
    streams: [{ label: "調理", date: "2026-08-20", videoId: "qMmJYgQww8Y", title: "ジョージア風フルーツジュースつくろ！" }],
  },
  {
    slug: "ojakhuri",
    name: "オジャフリ",
    emoji: "🍖",
    icon: "food-meat-ribs",
    country: "georgia",
    kind: "meat",
    date: "2026-08-21",
    note: "ジョージアの家庭料理。肉とじゃがいもを一緒に炒める。",
    streams: [{ label: "調理", date: "2026-08-21", videoId: "xo1eYfB4RyU", title: "ジョージア料理オジャフリつくろーー！！" }],
  },
];

export const recipeBySlug = (slug: string) => RECIPES.find((r) => r.slug === slug);

/**
 * 何品目か。図鑑の番号にあたる。
 * 作った順（古い順）に1から振る。あとから料理が増えても、
 * 前に押したスタンプの番号は変わらない。
 */
const ORDER = [...RECIPES].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => r.slug);
export const recipeNo = (slug: string) => ORDER.indexOf(slug) + 1;
