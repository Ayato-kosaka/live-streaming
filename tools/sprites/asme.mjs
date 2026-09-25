/**
 * ログインした人として撮るための差し込み口（`SEED=` に渡す）。
 *
 *   SEED=$PWD/tools/sprites/asme.mjs \
 *   PORT=4510 PAGES=/me.html TAG=me node tools/sprites/inkpx.mjs
 *   ADMIN=1 SEED=.../asme.mjs PORT=4510 URLS=/me.html node tools/sprites/popcheck.mjs
 *
 * **この箱では本物のログインができない。** Google の同意画面にも
 * `identitytoolkit.googleapis.com` にも出られないので、じぶんのこと（`/me`）は
 * 測ろうとすると「ここは、入った人のところ」しか写らない。**面の9割が測れない。**
 *
 * かわりに、Firebase が持ち帰る「前に入った人」の控え（IndexedDB の
 * `firebaseLocalStorageDb`）を、開く前に自分で置く。SDK はそれを見て
 * 「入っている人」として始まるので、そこから先は本番と同じ道を通る。
 * 島の API（`/island-api/...`）は、この箱から本番に書かせないためにも
 * ぜんぶここで差し替える。
 *
 * `ADMIN=1` を付けると、あやと（`admin`）として撮る。旅の道具が出る。
 *
 * ルーレット（#164）の口もここで返す。**表示側（`/roulette?s=…`）は
 * ログインが要らない**ので、`apply` を呼ぶだけで撮れる。
 * `RLSPIN=1` を付けると、開いた 1.2 秒あとに回りだすところから撮れる。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM";
const UID = "fakeuid0001";
const NAME = "ゆずたつ";
/** 本番と同じ形の絵。`route.mjs` の `offline` が /tmp/avatars から1人ずつ返す */
const PHOTO = "https://lh3.googleusercontent.com/d/1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47=s96";
/** 本番の `islandChannels.photo` と同じ形の URL。**差し替えた絵にしない。**
    ここを別の絵にしていたせいで「YouTube の顔が消えた」と誤認して、
    直っていないのに直ったと報告した（2026-09-09）。本番と同じものを置く。 */
const YT_PHOTO =
  "https://yt3.ggpht.com/GUqKfpGZZ-RvK4x8whkP6V7GfFc4FLoPC7rBUJ5jaqOdgouJabHkcGM8et_logXB62byGalyPA=s800-c-k-c0x00ffffff-no-rj";
/** 上の絵に割り当ててあるチャンネル（`site/content/residents.ts`） */
const CHANNEL = "UCyct2GK_RiW5Ji3Y0gd9MMg";

/** チャンネル → キャラクターの書類ID。**焼き込みから読む**（写しを置かない） */
const ICON_OF = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../../site/content/residents.ts"), "utf8");
  const out = new Map();
  for (const m of src.matchAll(/\{[^{}]*\}/g)) {
    const icon = /icon:\s*"([^"]+)"/.exec(m[0])?.[1];
    const ch = /channel:\s*"([^"]+)"/.exec(m[0])?.[1];
    if (icon && ch) out.set(ch, icon);
  }
  return out;
})();

/**
 * 誰でも読める応答の形にする（`functions/src/cards.ts` の `forEveryone`）。
 *
 * **本番の `GET /cards` は `channelId` も本当のカードIDも返さない。**
 * ここを本番と同じにしておかないと、撮ったときだけ絵が出て（`withIcons` が
 * `channelId` から引けてしまう）、本番で消えているものが見えない。
 * @param {object[]} list 中の形のカード
 * @return {object[]} 人を指す値の入っていない1枚ずつ
 */
const publicCards = (list) => {
  const seq = new Map();
  return list.map((c) => {
    const base = `${c.photoId}__${c.icon || "x"}`;
    const n = (seq.get(base) ?? 0) + 1;
    seq.set(base, n);
    const out = { ...c, id: `${base}__${n}` };
    delete out.channelId;
    return out;
  });
};

/** 本番の図鑑を curl で1回だけ取って、名前を作り物に差し替えて持つ。
    絵と絵文字と人数は本物（`route.mjs` が /tmp/chars から絵を返す）。 */
let CHARA_CACHE = null;
function CHARACTERS() {
  if (CHARA_CACHE) return CHARA_CACHE;
  try {
    const raw = execFileSync("curl", ["-sS", "--max-time", "40",
      "https://live-streaming-d3cac.web.app/island-api/characters"], { maxBuffer: 1 << 26 });
    CHARA_CACHE = (JSON.parse(raw).characters || []).map((c, i) => ({
      ...c,
      channelName: `@みほん${i + 1}`,
      aliases: i % 4 === 0 ? [`みほん${i + 1}`] : [],
      channelKeys: [`@みほん${i + 1}`], lookupKeys: [`みほん${i + 1}`],
      channelId: null, editedAt: null,
    }));
  } catch {
    CHARA_CACHE = [];
  }
  return CHARA_CACHE;
}

const now = Date.now();
const ago = (d) => new Date(now - d * 86400000).toISOString();

/* 溜まった状態を測るための種（#225）。**少なくして測らない。**
   2枚と2件では「縦に伸びきる」が再現しないので、じぶんのこと（`/me`）が
   実際に長くなる枚数を置く。付箋20枚・企画10件・カード9枚は、
   よく来てくれている人の半年ぶんにあたる。 */
const NOTE_TEXTS = [
  "北の国はクラクション少ない説を立証する",
  "島に温泉がほしい",
  "現地のスーパーで、いちばん謎な物を買って食べる",
  "ヒッチハイクで乗せてくれた人に、お礼のはがきを出す",
  "配信のはじめに、その日の朝ごはんを見せてほしい",
  "夜の市場を、しゃべらずに30分だけ歩く回",
  "その国でいちばん高いところに登って、街を見下ろす",
  "現地の子どもに日本語をひとことだけ教える",
  "駅の待合室で、隣に座った人に話しかけてみる",
  "1日ぜんぶ、公共交通だけで動く縛り",
  "地元の床屋に入って、おまかせで切ってもらう",
  "空港で寝る回をやってほしい。寝られるのか知りたい",
  "みんなで決めた買い物リストだけで、晩ごはんを作る",
  "国境を歩いて越えるところを、ノーカットで見たい",
  "現地の郵便局から、島のみんなに1通だけ手紙を出す",
  "コインランドリーで洗濯が終わるまでの雑談回",
  "その街でいちばん古い喫茶店を探しあてる",
  "地図を見ずに、聞いた道だけで宿まで帰る",
  "雨の日にしかやらない配信を1本だけ残しておく",
  "帰る前の日に、その旅でいちばん良かった場所へもう一度行く",
];
const THEMES_SEED = ["nordic", "island", "kitchen", "nordic", "island"];
/* 何枚あるところを測るか。**0 / 3 / 40 / 200 を差し替えて撮る**
   （データが溜まったときに壊れないかを見るため）。既定は本番に近い20枚。
   20枚を超えるぶんは同じ文を繰り返して水増しする。 */
const NOTE_N = Number(process.env.NOTES ?? NOTE_TEXTS.length);
const NOTE_ALL = Array.from(
  { length: NOTE_N },
  (_, i) =>
    NOTE_TEXTS[i % NOTE_TEXTS.length] +
    (i >= NOTE_TEXTS.length ? `（${Math.floor(i / NOTE_TEXTS.length) + 1}回目）` : ""),
);
const MINE = {
  notes: NOTE_ALL.map((text, i) => ({
    id: `a${i + 1}`,
    theme: THEMES_SEED[i % THEMES_SEED.length],
    text,
    by: NAME,
    hearts: [3, 0, 7, 1, 0, 12, 2, 0, 4, 1][i % 10],
    byOwner: false,
    /* 3枚に1枚は返事つき。**返事のある付箋がいちばん背が高い**ので、
       高さを測るときに返事の無いものだけで測らない */
    ...(i % 3 === 0 ?
      { reply: "やります。1日目から数えてみる。", repliedAt: ago(i + 1) } :
      {}),
    createdAt: ago(i + 2),
  })),
  more: false,
  next: null,
};
/* 掲示板（`/board`）に並ぶ「島じゅうの付箋」。**ここも `NOTES=` で増減する。**
   前は 20枚に固定してあって、`NOTES=200` を渡してもじぶんのこと（`/me`）の
   ほうしか増えなかった。掲示板は付箋と企画の2つが溜まる面なので、
   溜まったときに背が伸びないかは、こちらで測らないと分からない。 */
const ALL_N = Math.max(0, NOTE_N - 3);
const ALL = {
  notes: (NOTE_N === 0 ? [] : [
    { id: "b1", theme: "nordic", text: "友達へのプレゼントを決める", by: "まこも", hearts: 2, byOwner: false, createdAt: ago(1) },
    { id: "b2", theme: "island", text: "LINEのグループを作ってほしい", by: "のり", hearts: 1, byOwner: false, createdAt: ago(2) },
    { id: "b3", theme: "kitchen", text: "現地の粉でおやき", by: "", hearts: 0, byOwner: false, createdAt: ago(3) },
  ].slice(0, NOTE_N)).concat(
    Array.from({ length: ALL_N }, (_, i) => [NOTE_TEXTS[i % NOTE_TEXTS.length] + (i >= NOTE_TEXTS.length ? `（${Math.floor(i / NOTE_TEXTS.length) + 1}回目）` : ""), i]).map(([text, i]) => ({
      id: `c${i + 1}`,
      theme: THEMES_SEED[i % THEMES_SEED.length],
      text,
      by: ["まこも", "のり", "ひめひめ", "", "KURA"][i % 5],
      hearts: [1, 9, 0, 3, 22, 0, 5, 2, 0, 11][i % 10],
      byOwner: false,
      ...(i % 4 === 0 ? { reply: "これ、やってみます。", repliedAt: ago(i + 1) } : {}),
      createdAt: ago(i + 3),
    })),
  ),
  more: false,
  next: null,
};
const plan = (o) => ({
  when: "", date: "", note: "", tags: [], place: { name: "", area: "", map: "" },
  about: [], links: [], photos: [], embeds: [], hearts: 0, status: "proposed",
  createdAt: ago(3), updatedAt: ago(3), ...o,
});
const MY_PLAN_TITLES = [
  "1日だけ、現地の人の家に泊まる",
  "視聴者が決めた道を、ヴィリニュスまで",
  "国境の街で、そこにしかない朝ごはんを食べる",
  "1週間ぶんの服を、現地で全部そろえる",
  "地元のラジオ局に飛び込みで入ってみる",
  "みんなで作った歌を、広場で流す",
  "サウナのあとに湖へ飛び込む回",
  "24時間、島のみんなの指示だけで動く",
  "夜行列車で国をまたぐところを丸ごと",
  "帰りの空港で、この旅をふりかえる",
];
/* 出された企画の件数。**0 / 3 / 40 / 200 を差し替えて撮る。**
   付箋と同じで、溜まったときに背が伸びないかを見るための口。 */
const PLAN_N = Number(process.env.NPLANS ?? MY_PLAN_TITLES.length + 2);
const PLANS_ALL = [
    ...MY_PLAN_TITLES.map((title, i) =>
      plan({
        id: `p${i + 1}`,
        title,
        by: NAME,
        byUid: UID,
        hearts: [4, 9, 0, 2, 15, 1, 6, 0, 3, 8][i % 10],
        status: ["proposed", "next", "proposed", "done", "proposed"][i % 5],
        ...(i % 5 === 1 ? { planId: "nordic" } : {}),
        createdAt: ago(i + 3),
      }),
    ),
    plan({ id: "q1", title: "みんなで献立を決める日", by: "まこも", hearts: 9, createdAt: ago(9) }),
    plan({ id: "q2", title: "現地の市場で、名前の分からない野菜を買う", by: "のり", hearts: 3, createdAt: ago(11) }),
];
const PLANS = {
  plans: Array.from({ length: PLAN_N }, (_, i) => {
    const b = PLANS_ALL[i % PLANS_ALL.length];
    return i < PLANS_ALL.length ?
      b :
      { ...b, id: `x${i}`, title: `${b.title}（${Math.floor(i / PLANS_ALL.length) + 1}回目）`, createdAt: ago(i + 3) };
  }),
  more: false,
  next: null,
};

/** 旅の写真の置き場。**本番とおなじ形の URL**（`functions/src/cards.ts`）。
    この道具が差し込む写真は、**ぜんぶこの形にする。** すぐ下の注を読むこと。 */
const SHOT = (id) =>
  `https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app/o/nordic%2Fphotos%2F${id}.jpeg?alt=media`;

/* じぶんのこと（`/me`）が縦に伸びるのを測るための、**自分ぶんだけ**の9枚。
   下の `CARDS`（写真3枚 × 12人）にも自分は入っているが、そちらは1枚の
   写真につき1枚なので自分ぶんは3枚しかなく、「4枚出して、押すと+8」が
   動かない。**別の写真として9枚**要る。

   ## 宛先を `SHOT()`（＝置き場）にしてある理由

   前はここだけ `https://upload.wikimedia.org/seed-N.jpg` を差していた。
   「`route.mjs` の `offline` が wikimedia を1枚に差し替えるから」という
   つもりだったが、**`prod.mjs` の `open()` は `offline` を呼ばない。**
   通すのは `viaCurl`（＝`PASS`）と、この `apply` の2つだけ。
   そして `upload.wikimedia.org` は **`PASS` からわざと外してある**
   （こちらが回数を出すと 429 が返って、確かめが揺れるため）。
   つまり `/cards` `/me` を本番で撮ると、**誰が測っても必ず
   「絵が落ちた 3枚」**（畳みを開けば9枚）と出ていた。本番は無事なのに。

   だから宛先は **`apply` が自分で握りつぶす先**に置く。`SHOT()` なら

   - 外へ1バイトも出ない（下の `firebasestorage.googleapis.com` の route が
     その場で絵を作って返す）。混み具合や 429 で揺れない
   - **本番と同じ形の URL** なので、URL の形を見ている画面側の道と、
     `CARDS`（旅の写真）の通る道が、どちらも本番のままになる
   - 写真IDごとに違う絵が返るので、9枚を見分けられる

   `data:` の URI でも外へは出ないが、本番にありえない形の URL を
   画面に渡すことになる。**差し込みは本番と同じ形にする**（この上の
   `YT_PHOTO` の注と同じ決めごと）ので、そちらは採らない。 */
const MY_CARDS = Array.from({ length: 9 }, (_, i) => ({
  /* **本人の口（`/cards/mine`）は本当のカードIDを返す**（`<画像のID>__<チャンネルID>`）。
     公開の口に出るときは `publicCards` が別のものに差し替える。 */
  id: `ph${i + 1}__${CHANNEL}`,
  day: ago(i + 1).slice(0, 10),
  photoId: `ph${i + 1}`,
  url: SHOT(`ph${i + 1}`),
  w: 1600, h: 1067,
  note: "その日の1枚",
  channelId: CHANNEL,
  /** **本番はサーバーが絵を当てて返す**（`iconsOf`）。null で置かない */
  icon: ICON_OF.get(CHANNEL) ?? null,
  name: NAME,
  x: 0.5, y: 0.82, rot: 0, scale: 1,
  moved: false,
  at: now - (i + 1) * 86400000,
}));

/**
 * Doneru の対応表（#190）。**あやとの画面でしか出ない。**
 *
 * 本番の口は名前からチャンネルIDを引くが（島の名簿 → YouTube）、
 * この箱からはどちらにも出られない。**打った字で返事を決める。**
 *   `@ふたご`   … 2人に使われている（決めない）
 *   `@いない…`  … 見つからない
 *   それ以外     … つながる
 */
let DONORS = [
  { viewerPk: "117763460062995449096", label: "きのう来た人", handle: null, channelId: null, channelName: null, state: "new", isOwner: false, note: null, firstSeenAt: ago(1), editedAt: null, canDelete: false },
  { viewerPk: "115344581653245733797", label: "KURA ekisu", handle: null, channelId: null, channelName: null, state: "new", isOwner: false, note: null, firstSeenAt: ago(4), editedAt: null, canDelete: false },
  { viewerPk: "114910762433928193967", label: "信州檸檬", handle: null, channelId: null, channelName: null, state: "unlinked", isOwner: false, note: null, firstSeenAt: null, editedAt: ago(20), canDelete: false },
  { viewerPk: "101760203751954301886", label: null, handle: "@ひめひめ-r9z", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", channelName: "@ひめひめ-r9z", state: "linked", isOwner: false, note: null, firstSeenAt: null, editedAt: null, canDelete: false },
  { viewerPk: "103311111111111111111", label: null, handle: "@まーさん7286", channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", channelName: "@まーさん7286", state: "linked", isOwner: false, note: null, firstSeenAt: null, editedAt: null, canDelete: false },
  /* 溜まった状態（#225）。**1人ぶんが4段ある**ので、紐付け待ちが10人たまると
     畳みの中がスマホ5画面ぶんになる。そこを測れるだけ置いておく。 */
  ...Array.from({ length: 8 }, (_, i) => ({
    viewerPk: `1200000000000000000${i}`,
    label: ["夜中のひと", "みかん", "こんぶ", "たぬき", "ひまわり", "しろくま", "やまびこ", "あさひ"][i],
    handle: null, channelId: null, channelName: null, state: "new",
    isOwner: false, note: null, firstSeenAt: ago(i + 1), editedAt: null, canDelete: false,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    viewerPk: `1300000000000000000${i}`,
    label: null,
    handle: `@みつかった${i + 1}`,
    channelId: `UCzzzzzzzzzzzzzzzzzzzz${String(i).padStart(2, "0")}`,
    channelName: `@みつかった${i + 1}`,
    state: "linked", isOwner: false, note: null, firstSeenAt: null, editedAt: ago(i + 2), canDelete: false,
  })),
];

/* スパチャの控え（#292）。**本番と同じ件数で置く。**
   本番は 415件（`islandFundSuperChats`）で、うち16件が手入力、
   そのうち13件は日付が分かっていない（`day` が空）。少なくして撮ると
   「日ごとにまとめても背が伸びない」を確かめたことにならない。
   名前は作り物（本番の名前をこの箱に落とさない）。 */
const SC_NAMES = [
  "ひめひめ", "まーさん", "KURA ekisu", "信州檸檬", "夜中のひと", "みかん",
  "こんぶ", "たぬき", "ひまわり", "しろくま", "やまびこ", "あさひ",
  "", "ゆうやけ", "こもれび", "みなと",
];
const SC_YEN = [500, 1000, 200, 3000, 5000, 1500, 300, 10000, 2000, 700];
const FUND_ALL = (() => {
  const out = [];
  let day = new Date("2026-09-10T00:00:00+09:00");
  let i = 0;
  /* 1日に1〜4件、2〜4日おき。1年半ぶんで 400件ほどになる。 */
  while (out.length < 402) {
    const n = 1 + (i % 4);
    const d = day.toISOString().slice(0, 10);
    for (let k = 0; k < n && out.length < 402; k++) {
      const h = 20 + ((i + k) % 4);
      const m = (i * 7 + k * 13) % 60;
      out.push({
        id: `sc${String(out.length).padStart(4, "0")}aaaaaaaaaaaaaaaaaaaaaa`.slice(0, 26),
        day: d,
        at: `${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:0${k}+09:00`,
        yen: SC_YEN[(i + k) % SC_YEN.length],
        who: SC_NAMES[(i * 3 + k) % SC_NAMES.length],
        src: (i + k) % 9 === 0 ? "bigquery" : "alertbox",
      });
    }
    day = new Date(day.getTime() - (2 + (i % 3)) * 86400000);
    i++;
  }
  /* 手で入れたぶん。日付の分からない13件が、いちばん後ろに並ぶ。 */
  for (let k = 0; k < 13; k++) {
    out.push({ id: `manual-${k + 1}`, day: "", at: null, yen: 200 + k * 50, who: "", src: "manual" });
  }
  return out;
})();
const FUND_SUM = FUND_ALL.reduce((a, c) => a + c.yen, 0);

/* 豚の貯金箱の机（#292 のオーナー画面ぶん）。**額は本番と同じ数にしてある**
   （2026-09-24 の `GET /island-api/fund` が `total 86,510 / given 341,916 /
   goal 50,000`）。差し込みに本番と違う値を置くと、直っていないものが
   直って見える（`docs/island-misses.md` の決めごと2）。

     -255,406（起点） + 147,096（スパチャの半分） + 194,820（Doneru）= 86,510

   **名前と題は作り物。** 本物の出費の題は公開のリポジトリに置かない。 */
const FUND_DONERU = 194820;
let FUND_SPENDS = [
  { id: "2026-09-02-11111111", day: "2026-09-02", title: "アプリ運営費", yen: 5760 },
  { id: "2026-07-26-22222222", day: "2026-07-26", title: "アプリ運営費", yen: 30800 },
  { id: "2026-06-29-33333333", day: "2026-06-29", title: "アプリ運営費", yen: 14510 },
  { id: "2026-06-10-44444444", day: "2026-06-10", title: "散髪", yen: 11110 },
  { id: "2026-05-31-55555555", day: "2026-05-31", title: "退避", yen: 36300 },
  { id: "2026-05-23-66666666", day: "2026-05-23", title: "お菓子", yen: 300 },
  { id: "2026-05-22-77777777", day: "2026-05-22", title: "シャワルマ", yen: 570 },
  { id: "2026-05-21-88888888", day: "2026-05-21", title: "これまでの退避", yen: 156056 },
];
let FUND_GOALS = [
  { id: "2026-07-27", from: "2026-07-27", to: null, label: "北欧周りたい", yen: 50000 },
  { id: "2026-03-01", from: "2026-03-01", to: "2026-07-26", label: "カメラを買う", yen: 40000 },
];
/* スパチャ・ドネの履歴（2026-09-25）。**本文つきで、まぜて時系列。**
   本物と同じ形（`GET /island-api/fund/feed`）で返す。名前も本文も作り物。 */
const GOT_TEXT = [
  "いつも楽しく見てます！", "きょうのコロッケ、おいしそうでした",
  "", "北欧たのしんできてね", "配信ありがとう〜",
  "道中きをつけて", "", "スウェーデンのごはん気になる",
];
let FUND_GOT = (() => {
  const out = [];
  let t = Date.parse("2026-09-24T22:40:00+09:00");
  for (let i = 0; i < 60; i++) {
    const at = new Date(t).toISOString().replace("Z", "+00:00");
    const jst = new Date(t + 9 * 3600 * 1000).toISOString();
    out.push({
      id: i % 3 === 0 ? `d${String(i).padStart(4, "0")}` :
        `sc${String(i).padStart(4, "0")}aaaaaaaaaaaaaaaaaaaaaa`.slice(0, 26),
      kind: i % 3 === 0 ? "donation" : "superchat",
      at: `${jst.slice(0, 19)}+09:00`,
      day: jst.slice(0, 10),
      yen: SC_YEN[i % SC_YEN.length],
      who: SC_NAMES[(i * 3) % SC_NAMES.length],
      text: GOT_TEXT[i % GOT_TEXT.length],
    });
    t -= (7 + (i % 5)) * 60 * 1000;
  }
  return out;
})();
/** 時刻のわからない控え（GAS から移したぶん）。**並びに出ない** */
const GOT_NOTIME = { count: 13, yen: 3000 };
/** リアルタイムを測るための印。1回だけ「いま届いた」を作る */
let FEED_START = 0;
let FEED_SENT = 0;
/** さっき「もう一度出して」と頼まれた1件。**二度押しで二度出さない** */
let REPLAY_LAST = "";

/** 焼き直し（`island/state.fund.box`）。**出費を足し引きしたら作り直す。** */
const fundBox = () => {
  const spend = FUND_SPENDS.reduce((a, s) => a + s.yen, 0);
  const now = FUND_GOALS.find((g) => !g.to);
  return {
    superchat: 147096,
    superchatFull: 294192,
    count: 509,
    spend,
    spendCount: FUND_SPENDS.length,
    start: -spend,
    goal: now ? { from: now.from, label: now.label, yen: now.yen } : null,
    updatedAt: "2026-09-24",
  };
};

/** ルーレットのセッション（#164）。id は本番と同じ 32 桁。 */
const RL_ID = "0123456789abcdef0123456789abcdef";
const rlItem = (id, label, name, byHand = false) => ({
  id, label, name: byHand ? "" : name, icon: byHand ? "" : PHOTO, byHand,
});
let RL_ITEMS = [
  rlItem("c1", "トビリシの温泉", "まこも"),
  rlItem("c2", "ヒッチハイクで隣の国", "のり"),
  rlItem("c3", "24時間クッキング", "ゆずたつ"),
  rlItem("c4", "視聴者の家に泊まる", "まこも"),
  rlItem("c5", "深夜の市場めぐり", "", true),
];
const RL_LINES = [
  { id: "m1", name: "まこも", text: "山に登るのはどう", icon: PHOTO, channelId: "c", at: now },
  { id: "m2", name: "のり", text: "地元の市場で買い物", icon: PHOTO, channelId: "c", at: now },
  { id: "m3", name: "ゆずたつ", text: "ワイン作りを見にいく", icon: PHOTO, channelId: "c", at: now },
  { id: "m4", name: "まこも", text: "温泉！", icon: PHOTO, channelId: "c", at: now },
];

/* ---------------- あやと島カード（#173 / #202） ----------------
   **本番の形をそのまま置く。** 本番はいま1枚の写真に4人ぶんだが、旅に出れば
   1日に写真が何枚も貼られて、投げてくれた人ぶんカードが増える
   （写真3枚 × 12人 = 36枚）。**一覧が散らかるのはそこから**なので、
   撮るときは増えた側の形で撮る。

   持ち主は `site/content/residents.ts` にある実在のチャンネルから採る。
   絵に結びつかない人のカードは画面に出ない（`components/cards/cards.ts`）ので、
   でたらめな ID を並べると1枚も写らない。 */
const CARD_CHANNELS = [
  "UCNTxy7hXktoG4V6jT6A3M9A", "UCTXgxriwnTlJ0y1tff0yU5A", "UCEw49OqT87MZEDQJVkjWNRA",
  "UCJPDZ4SQYonw3vZvyxVKrjg", "UCHdRx9BTg6q_SF5y-4Wg5WQ", "UCfhX-rOzBe-QhWPPv03FtQA",
  "UCbz2F3GGD_EpBzrWb8WM-cg", "UCceC2uQXoN9wt2POovos37Q", "UCsBjGz8D3lLxUhV_eNxN0CQ",
  "UCaHTatQmUMV4TEkSDIeSzHw", "UCn4EuDFdAfeYGhuFOxpj-NA", CHANNEL,
];
/** 名前を出してよいと言った人だけ名前が返る。全員ぶん返すと本番と違う */
const CARD_NAMES = { [CHANNEL]: NAME, "UCTXgxriwnTlJ0y1tff0yU5A": "まこも" };
/** 本番の3枚ぶん。縦と横を混ぜる（カードの絵の載せ方が向きで変わるため） */
const CARD_SHOTS = [
  { id: "oMXREHFFNMbr37TtIwlE", day: "2026-09-06", ev: "food-wine-fest", w: 1200, h: 1600, note: "ジョージア最後の街歩きの夜景" },
  { id: "kQ2rTn5wY8bLxA1cVdEf", day: "2026-09-11", ev: "nordic-day-depart", w: 1600, h: 1200, note: "クタイシ空港へ向かう朝" },
  { id: "p7XsWq0ZmB4nCtL9hRyU", day: "2026-09-11", ev: "georgia-bye", w: 1200, h: 1600, note: "トビリシの部屋、最後の荷造り" },
];
/** 置き方は本番と同じ式（`functions/src/streamEvents.ts` の `defaultPlace`）で散らす */
const spread = (id, k) => {
  let h = (0x811c9dc5 ^ (k * 0x9e3779b9)) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 100000) / 100000;
};
const CARDS = CARD_SHOTS.flatMap((s) =>
  CARD_CHANNELS.map((chan, n) => {
    const id = `${s.id}__${chan}`;
    return {
      id, day: s.day, photoId: s.id, url: SHOT(s.id), w: s.w, h: s.h, note: s.note,
      /* **絵はサーバーが当てて返す**（`functions/src/cards.ts` の `iconsOf`）。
         `null` にして画面の焼き込みから引かせると、`channelId` を返さなく
         なった公開の口を撮っているつもりで、1枚も写らない。 */
      channelId: chan, icon: ICON_OF.get(chan) ?? null, name: CARD_NAMES[chan] ?? null,
      x: 0.62 + spread(id, 0) * 0.26,
      y: 0.88 + spread(id, 1) * 0.08,
      rot: -4 + spread(id, 2) * 8,
      scale: 0.92 + spread(id, 3) * 0.16,
      moved: false, at: 1788724247800 - n, streamEventId: s.ev,
    };
  }),
);

/** 写真ID → その写真の縦横。**差し込んだ `w`/`h` から作る**（写しを置かない）。
    `apply` の中の置き場の差し替えが、この大きさで絵を返す。ここと差し込みが
    ずれると、カードの中で写真が伸びたり潰れたりする。 */
const PHOTO_SIZE = new Map([
  ...CARD_SHOTS.map((s) => [s.id, [s.w, s.h]]),
  ...MY_CARDS.map((c) => [c.photoId, [c.w, c.h]]),
]);

/* 旅の写真（`GET /nordic/photos`）。**本番と同じ形で返す。**
   本番はいま 2026-09-06 の1枚に4人だが、旅に出れば1日に何枚も貼られる。
   カード（`CARDS`）と同じ写真・同じ人から作って、両方の面が同じものを
   見ている状態で撮れるようにする（別々の種を置くと、統合したあとに
   「同じ写真なのに枚数が違う」が撮れてしまう）。 */
const PHOTO_DAYS = (() => {
  const at = new Map();
  for (const s of CARD_SHOTS) {
    const d = at.get(s.day) ?? { day: s.day, photos: [], people: [] };
    d.photos.push({
      id: s.id, day: s.day, url: SHOT(s.id), w: s.w, h: s.h, note: s.note,
      at: 1788724247800,
    });
    at.set(s.day, d);
  }
  for (const d of at.values()) {
    /* **本番は `channelId` を返さない**（`functions/src/cards.ts` の
       `peopleForEveryone`）。出るのは絵と、名前を出してよいと言った人の名前だけ。 */
    d.people = CARD_CHANNELS.map((chan) => ({
      icon: ICON_OF.get(chan) ?? null, name: CARD_NAMES[chan] ?? null,
    }));
  }
  return [...at.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
})();

export async function apply(ctx, opts = {}) {
  const admin = opts.admin ?? process.env.ADMIN === "1";
  /* 島のキャラクターが割り当たっていない人。**あやと自身がこれ。**
     住人の表（`content/residents.ts`）は視聴者さんの絵なので、配信する側は
     そこに居ない。看板の右はしがどう出るかは、この人でしか確かめられない
     （キャラのある人で撮ると絵が出てしまい、落ちたときの形が見えない）。 */
  const nochara = opts.nochara ?? process.env.NOCHARA === "1";
  /* 誰として撮るか。**看板の右はしは1人ぶんしか出ない**ので、22人の絵を
     見るには人を差し替えて撮り直すしかない。チャンネルを渡すと、
     その人のキャラクターで撮れる（`ASCHAN=` でも渡せる）。 */
  const channel = opts.channel ?? process.env.ASCHAN ?? CHANNEL;
  const who = nochara ?
    { name: "@あやとグルメアプリ", channel: "UCnobodynobodynobody00" } :
    { name: NAME, channel };
  const json = (r, body) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  // 前に入った人を読み直すところ。**本番には出さない**（この箱から出られない）
  await ctx.route(/identitytoolkit\.googleapis\.com/, (r) =>
    json(r, {
      users: [{
        localId: UID, displayName: who.name, photoUrl: PHOTO, email: "a@example.com",
        emailVerified: true, providerUserInfo: [], validSince: "0",
        lastLoginAt: "1600000000000", createdAt: "1600000000000",
      }],
    }),
  );
  await ctx.route(/securetoken\.googleapis\.com/, (r) =>
    json(r, {
      access_token: "FAKE", expires_in: "3600", token_type: "Bearer",
      refresh_token: "FAKE_REFRESH", id_token: "FAKE", user_id: UID,
      project_id: "291182823114",
    }),
  );
  /* カードの写真は Firebase Storage にある。**この箱からは出られない。**
     1枚に潰すと3枚が同じ絵で写って、写真ごとにまとまっているかが見えないので、
     写真のIDから色を決めて1枚ずつ違う絵を返す。`crossOrigin="anonymous"` で
     読むので、CORS のヘッダを付けないと絵が出ない。 */
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
    const m = /photos%2F([^.]+)\.jpe?g/.exec(r.request().url());
    /* **旅の写真だけを差し替える。** 置き場にはキャラクターの絵も入って
       いるので（#284）、まとめて受けると**95人が全員おなじ緑の絵**で写る。
       あやとの机の「キャラ」を撮ったとき、実際にそうなっていた
       （2026-09-11）。写真でないものは通す（`viaCurl` が本物を取る）。 */
    if (!m) return r.fallback();
    const key = m[1];
    /* **写真ごとに違う絵にする。** 前の混ぜ方（`h*31+c`）は末尾の1字しか
       違わない ID を散らせず、`ph1`〜`ph9` の色相が 25〜33 に固まって
       **9枚が同じ色**で写った。FNV-1a で散らしたうえ、**ID を字で描く。**
       色が寄っても、どの写真かは読めば分かる（`route.mjs` の
       「1枚に潰さない」と同じ理由）。 */
    let v = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) v = Math.imul(v ^ key.charCodeAt(i), 0x01000193) >>> 0;
    /* **混ぜ終わりに、上の桁を下へ落とす。** FNV だけで 360 の剰余を取ると、
       末尾1字が 1 違う ID は必ず 179 ずれるので、`ph1`〜`ph9` が
       **2色の交互**にしかならなかった（実測。緑と赤紫だけ）。 */
    v ^= v >>> 15; v = Math.imul(v, 0x2545f491) >>> 0; v ^= v >>> 13;
    const h = v % 360;
    /* **縦横は、差し込んだ `w`/`h` と合わせる。** どの写真も 1200×1600 で
       返していたので、横の写真（1600×1200）や `MY_CARDS`（1600×1067）が
       カードの中で縦に伸びていた。表に無い ID は本番の縦写真の形で返す。 */
    const [W, H] = PHOTO_SIZE.get(key) ?? [1200, 1600];
    const r2 = (n) => Math.round(n);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="hsl(${h},42%,38%)"/>
      <rect y="${r2(H * 0.69)}" width="${W}" height="${r2(H * 0.31)}" fill="hsl(${(h + 24) % 360},38%,26%)"/>
      <circle cx="${r2(W * 0.75)}" cy="${r2(H * 0.2)}" r="${r2(Math.min(W, H) * 0.12)}" fill="hsl(${(h + 40) % 360},60%,72%)"/>
      <text x="${r2(W / 2)}" y="${r2(H * 0.56)}" text-anchor="middle" fill="#fff"
            font-family="sans-serif" font-size="${r2(Math.min(W, H) * 0.13)}">${key.replace(/[<>&]/g, "")}</text>
    </svg>`;
    r.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: svg,
    });
  });

  await ctx.route(/\/island-api\//, (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    /* **キャラクターの絵は差し替えない。本物を通す。**
       絵も `/island-api/...` から来るようになったので（#284）、ここの
       受け皿（最後の `json(r, {})`）が絵まで JSON にしていた。
       島の住人が1人も出なくなって、**本番が壊れているように見えた**
       （2026-09-11。`route.mjs` の「1枚に潰さない」と同じ失敗）。 */
    if (/^\/characters\/[^/]+\/(plain|scene)-\d+\.webp$/.test(path)) {
      return r.fallback();
    }
    /* **キャラクターの名簿も、本物の数と絵で返す。**
       ここで `{}` を返していたので、あやとの机の「キャラ」が
       **95人いるのに「まだ1人もいません」**と写っていた（2026-09-11）。
       画面のほうは正しい（読めた上での0人と、読めなかったを分けている）
       のに、道具が0人を渡していただけ。**それでは机を見たことにならない。**
       名前だけ作り物にする（本番の名前をこの箱に落とさない）。 */
    if (path === "/characters") return json(r, { characters: CHARACTERS() });
    if (path === "/me") {
      return json(r, {
        /* `channelPhoto` は毎晩 islandChannels から入れ直る顔で、**じぶんのことに
           出るのはこれだけ**（#226 のあと。止まった `photo` は使わない）。
           NOCHARA=1 のときは、まだ入っていない人として空にする。 */
        uid: UID, name: who.name, channelId: who.channel, photo: PHOTO,
        channelPhoto: YT_PHOTO,
        nickname: null, showName: true, showPhoto: true, admin,
      });
    }
    if (path === "/stickies") {
      return json(r, u.searchParams.get("mine") === "1" ? MINE : ALL);
    }
    if (path === "/nextplans") return json(r, PLANS);
    /* **公開の口は、人を指す値を落としてから返す**（本番と同じ）。
       ここを落とさずに撮ると、直したものが直っていない姿で写る。 */
    if (path === "/cards") {
      return json(r, { cards: publicCards([...CARDS, ...MY_CARDS]) });
    }
    /* `/me` は公開の `/cards` ではなく、**本人だけの口**から引く。
       ここを差し替えないと、撮ったときだけ「カードが読めなかった」の顔に
       なって、直っていないものが壊れて見える。 */
    if (path === "/cards/mine") return json(r, { cards: MY_CARDS });
    if (path.startsWith("/donors")) {
      if (r.request().method() === "GET") return json(r, { donors: DONORS });
      const pk = decodeURIComponent(path.slice("/donors/".length));
      if (r.request().method() === "DELETE") {
        DONORS = DONORS.filter((d) => d.viewerPk !== pk);
        return json(r, { deleted: pk });
      }
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      const typed = String(body.handle || "").trim();
      if (!body.clear && typed === "@ふたご") {
        return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "duplicate", typed }) });
      }
      if (!body.clear && typed.startsWith("@いない")) {
        return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "notfound", typed }) });
      }
      const had = DONORS.find((d) => d.viewerPk === pk);
      const via = body.clear ? null : /^UC[\w-]{22}$/.test(typed) ? "id" : "dict";
      const donor = {
        ...(had || { viewerPk: pk, label: null, isOwner: false, note: null, firstSeenAt: null, canDelete: true }),
        handle: body.clear ? null : typed,
        channelId: body.clear ? null : "UCcccccccccccccccccccccc",
        channelName: body.clear ? null : typed,
        state: body.clear ? "unlinked" : "linked",
        editedAt: new Date().toISOString(),
      };
      DONORS = had ? DONORS.map((d) => (d.viewerPk === pk ? donor : d)) : [donor, ...DONORS];
      return json(r, { donor, via });
    }
    /* スパチャの控え（#292）。**ページ送りも本番と同じ形で返す。**
       `before` を無視すると「もっと古いぶん」を押しても同じ12件が
       もう一度積まれて、押しどころを確かめたことにならない。 */
    if (path === "/fund/history") {
      if (opts.fundempty ?? process.env.FUNDEMPTY === "1") {
        return json(r, { chats: [], more: false, next: null, count: 0, yen: 0 });
      }
      const n = Math.min(Math.max(Number(u.searchParams.get("limit") || 30), 1), 60);
      const before = u.searchParams.get("before");
      const at = before ? FUND_ALL.findIndex((c) => `${c.day}_${c.id}` === before) + 1 : 0;
      const chats = FUND_ALL.slice(at, at + n);
      const more = at + n < FUND_ALL.length;
      const last = chats[chats.length - 1];
      return json(r, {
        chats,
        more,
        next: more && last ? `${last.day}_${last.id}` : null,
        /* **数えられなかった日**は `FUNDNOSUM=1` で撮れる（0 に倒さない）。 */
        count: (opts.fundnosum ?? process.env.FUNDNOSUM === "1") ? null : FUND_ALL.length,
        yen: (opts.fundnosum ?? process.env.FUNDNOSUM === "1") ? null : FUND_SUM,
      });
    }
    /* 豚の貯金箱の机（#292）。**書いた結果まで返す**ので、押したあとの
       姿（増えていない・額が変わった）もそのまま撮れる。
       `FUNDBOXDOWN=1` で「焼き直しが読めなかった」ほうも撮れる
       （0円と見分けが付くか。`docs/island-standards.md` 10章）。 */
    if (path.startsWith("/fund/")) {
      const m = r.request().method();
      const down = opts.fundboxdown ?? process.env.FUNDBOXDOWN === "1";
      const box = () => (down ? null : fundBox());
      const sorted = () =>
        [...FUND_SPENDS].sort((a, b) =>
          a.day === b.day ? b.id.localeCompare(a.id) : b.day.localeCompare(a.day));
      const page = (before, n) => {
        const all = sorted();
        const at = before ? all.findIndex((x) => `${x.day}_${x.id}` === before) + 1 : 0;
        const spends = all.slice(at, at + n);
        const more = at + n < all.length;
        const last = spends[spends.length - 1];
        return { spends, more, next: more && last ? `${last.day}_${last.id}` : null };
      };
      let body = {};
      try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
      if (path === "/fund/desk") {
        /* **1行も入っていない日**も撮れるようにする（`FUNDNONE=1`）。
           「まだ1行も入っていない」の次の一手が書いてあるかを見るため。 */
        if (opts.fundnone ?? process.env.FUNDNONE === "1") {
          const b0 = { ...fundBox(), spend: 0, spendCount: 0, start: 0, goal: null };
          return json(r, {
            box: b0,
            doneru: FUND_DONERU,
            total: b0.start + b0.superchat + FUND_DONERU,
            split: null,
            spends: [], more: false, next: null, goals: [],
          });
        }
        const b = box();
        const dn = down ? null : FUND_DONERU;
        const total = b && dn !== null ? b.start + b.superchat + dn : null;
        const nowGoal = FUND_GOALS.find((g) => !g.to);
        /* 内訳。**足し引きが必ず「いま」に戻る**のは本物と同じ（開始時点が
           残差）。期間内の数は、本番の実測に合わせてある
           （2026-07-27 から：スパチャ 12,140 / ドネ 40,600 / 出費 5,760）。 */
        const nosplit = opts.fundnosplit ?? process.env.FUNDNOSPLIT === "1";
        let split = null;
        if (total !== null && nowGoal && !nosplit) {
          const spendIn = FUND_SPENDS
            .filter((x) => x.day >= nowGoal.from)
            .reduce((a, x) => a + x.yen, 0);
          const scIn = 12140;
          const dnIn = 40600;
          const start = total - scIn - dnIn + spendIn;
          split = {
            start, superchat: scIn, doneru: dnIn, spend: spendIn,
            total: start + scIn + dnIn - spendIn,
            donationsAsOf: "2026-09-24",
          };
        }
        return json(r, {
          box: b,
          doneru: dn,
          total,
          split,
          ...page(null, 12),
          goals: [...FUND_GOALS].sort((a, b2) => b2.from.localeCompare(a.from)),
        });
      }
      /* スパチャ・ドネの履歴。`since` で新着だけ、`before` で続き。
         **`FUNDLIVE=<ミリ秒>` を渡すと、その時間がたったところで1件届く**
         ——リアルタイムが何秒で画面に出るかを測るために置いてある。 */
      if (path === "/fund/feed" && m === "GET") {
        const live = Number(opts.fundlive ?? process.env.FUNDLIVE ?? 0);
        if (live > 0 && !FEED_START) FEED_START = Date.now();
        /* **1回だけでなく、live ミリ秒ごとに1件足す。** 静かなときの遅れ
           （20秒の窓）と、配信中の遅れ（2秒の窓）は別の数なので、
           2件目以降まで測れないと「配信中は何秒か」が出せない。 */
        if (live > 0 && Date.now() - FEED_START >= live) {
          FEED_START = Date.now();
          FEED_SENT += 1;
          const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
          FUND_GOT = [{
            id: `sclive${String(FEED_SENT).padStart(20, "0")}`.slice(0, 26),
            kind: "superchat",
            at: `${jst.slice(0, 19)}+09:00`,
            day: jst.slice(0, 10),
            yen: 1234,
            who: "いまきたひと",
            text: "とどいた",
          }, ...FUND_GOT];
        }
        const n = Math.min(Number(u.searchParams.get("limit") || 15), 120);
        const since = u.searchParams.get("since");
        const before = u.searchParams.get("before");
        let all = [...FUND_GOT].sort((a, b2) => b2.at.localeCompare(a.at));
        if (since) all = all.filter((g) => g.at > since);
        if (before) all = all.filter((g) => g.at < before);
        const got = all.slice(0, n);
        const more = all.length > n;
        const last = got[got.length - 1];
        return json(r, {
          got, more, next: more && last ? last.at : null,
          noTime: !since && !more ? GOT_NOTIME : null,
        });
      }
      /* もう一度出す。**本物と同じで、送られてきた字は返さない**
         （台帳の1件から組む）。同じ1件を続けて頼むと `already`。 */
      if (path === "/fund/replay" && m === "POST") {
        const row = FUND_GOT.find(
          (g) => g.id === body.id && g.kind === body.kind);
        if (!row) {
          return r.fulfill({ status: 404, contentType: "application/json",
            body: JSON.stringify({ error: "notfound" }) });
        }
        const key = `${body.kind}_${body.id}`;
        const already = REPLAY_LAST === key;
        REPLAY_LAST = key;
        return json(r, {
          already, seq: Date.now(),
          shown: { kind: row.kind, id: row.id, yen: row.yen, who: row.who,
            text: row.text },
        });
      }
      if (path === "/fund/spends" && m === "GET") {
        return json(r, page(u.searchParams.get("before"),
          Math.min(Number(u.searchParams.get("limit") || 12), 120)));
      }
      if (path === "/fund/spends" && m === "POST") {
        const id = `${body.day}-${String(body.title).length}${body.yen}`.slice(0, 40);
        const already = FUND_SPENDS.some((x) => x.id === id);
        const spend = { id, day: body.day, title: body.title, yen: body.yen };
        if (!already) FUND_SPENDS = [spend, ...FUND_SPENDS];
        return json(r, { spend, already, box: box() });
      }
      if (path.startsWith("/fund/spends/") && m === "DELETE") {
        const id = decodeURIComponent(path.slice("/fund/spends/".length));
        FUND_SPENDS = FUND_SPENDS.filter((x) => x.id !== id);
        return json(r, { deleted: id, box: box() });
      }
      if (path === "/fund/goals" && m === "POST") {
        const goal = { id: body.from, from: body.from, to: null, label: body.label, yen: body.yen };
        const already = FUND_GOALS.some((g) => g.id === goal.id);
        /* **前のは機械が閉じる**（本物と同じ。単独の「閉じる」は無い）。
           閉じる日は新しい目標の前の日 */
        const to = new Date(Date.parse(`${body.from}T00:00:00Z`) - 86400000)
          .toISOString().slice(0, 10);
        const open = FUND_GOALS.filter((g) => !g.to && g.id !== goal.id);
        FUND_GOALS = [
          goal,
          ...FUND_GOALS.filter((g) => g.id !== goal.id)
            .map((g) => (g.to ? g : { ...g, to })),
        ];
        return json(r, { goal, already, closed: open.length, box: box() });
      }
      if (path.startsWith("/fund/goals/") && m === "DELETE") {
        const from = decodeURIComponent(path.slice("/fund/goals/".length));
        FUND_GOALS = FUND_GOALS.filter((g) => g.id !== from);
        return json(r, { deleted: from, box: box() });
      }
      if (path === "/fund/chats" && m === "POST") {
        return json(r, {
          chat: { id: `manual-x`, day: body.day, yen: body.yen, who: body.who },
          already: false,
          box: box(),
        });
      }
      if (path.startsWith("/fund/chats/") && m === "DELETE") {
        const id = decodeURIComponent(path.slice("/fund/chats/".length));
        return json(r, { deleted: id, box: box() });
      }
    }
    if (path === "/nordic/photos") return json(r, { days: PHOTO_DAYS });
    /* アラートボックスの合言葉（#180）。**本物の32桁と同じ形にする。**
       画面は `?k=` を貼る URL を組み立てて出すだけなので、形が違うと
       出てくる URL が本番と別物になり、押しどころも幅も測れない。 */
    if (path === "/alertbox/session") {
      /* NOKEY=1 で「Doneru の鍵がまだ入っていない」ほうを撮れる。
         本番で実際に止まったのがその状態だった（2026-09-09）ので、
         **直したほうだけでなく、止まっているほうも測れるようにする。** */
      const nokey = opts.nokey ?? process.env.NOKEY === "1";
      return json(r, {
        id: "0123456789abcdef0123456789abcdef",
        doneru: nokey ? { set: false, tail: "" } : { set: true, tail: "7f3a" },
      });
    }
    if (path === "/roulette/doneru") {
      return json(r, { doneru: { set: true, tail: "7f3a" } });
    }
    if (path.startsWith("/roulette")) {
      const spin = opts.spin ?? process.env.RLSPIN === "1";
      const at = Date.now() + 1200;
      const ses = {
        id: RL_ID, status: spin ? "回っている" : "準備中", items: RL_ITEMS,
        wait: 10, duration: 15, turns: 10, theme: "classic", sound: false,
        result: spin ? RL_ITEMS[1].id : null, resultIndex: spin ? 1 : null,
        spunAt: spin ? at : null, postAt: spin ? at + 25000 : null,
        posted: false, updatedAt: spin ? 1 : 2,
      };
      if (path.endsWith("/comments")) {
        // 2回目からは空。撮るたびに増えると、撮った絵が毎回変わる
        const first = !ctx.__rlSeen;
        ctx.__rlSeen = true;
        return json(r, { lines: first ? RL_LINES : [], wait: 600000, live: true });
      }
      if (path.endsWith("/items")) {
        try {
          RL_ITEMS = JSON.parse(r.request().postData() || "{}").items ?? RL_ITEMS;
        } catch {}
        return json(r, { session: { ...ses, items: RL_ITEMS } });
      }
      if (path.endsWith("/start")) return json(r, { session: ses, live: true });
      return json(r, { session: ses, now: Date.now() });
    }
    if (path === "/state") {
      return json(r, {
        current: { place: "ジョージア・トビリシ", theme: "georgia", word: "トビリシにいます。", week: [], updatedAt: "2026-09-04" },
        stats: {}, ideas: [], notes: [], residents: [], nordic: {},
      });
    }
    return json(r, {});
  });

  await ctx.addInitScript(
    ({ KEY, user }) => {
      try {
        localStorage.setItem("ayato-island-signedin", "1");
      } catch {}
      const req = indexedDB.open("firebaseLocalStorageDb", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("firebaseLocalStorage", "readwrite");
        tx.objectStore("firebaseLocalStorage").put({
          fbase_key: `firebase:authUser:${KEY}:[DEFAULT]`,
          value: user,
        });
      };
    },
    {
      KEY,
      user: {
        uid: UID,
        email: "a@example.com",
        emailVerified: true,
        displayName: who.name,
        isAnonymous: false,
        photoURL: PHOTO,
        providerData: [
          { providerId: "google.com", uid: "1", displayName: who.name, email: "a@example.com", phoneNumber: null, photoURL: PHOTO },
        ],
        // 期限を先にしておくと、開いた瞬間に取り直しにいかない
        stsTokenManager: { refreshToken: "FAKE_REFRESH", accessToken: "FAKE_ACCESS", expirationTime: now + 3600000 },
        createdAt: "1600000000000",
        lastLoginAt: "1600000000000",
        apiKey: KEY,
        appName: "[DEFAULT]",
      },
    },
  );
}
