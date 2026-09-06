/**
 * 島の「動くところ」の読み書き。
 * Firestore へは直接触らず、Cloud Functions(/island-api)経由にしている。
 * こうしておくと Firestore のセキュリティルールを変えずに済むし、
 * 連投制限やモデレーションもサーバー側でまとめて掛けられる。
 */

export const API_BASE = "/island-api";

export type IslandCurrent = {
  place: string;
  theme: string;
  word: string;
  week: string[];
  updatedAt: string;
};

export type IslandStats = {
  streams: number;
  streamDays: number;
  comments: number;
  people: number;
  countries: number;
  recipes: number;
  since: string;
  updatedAt: string;
  latest?: { videoId: string; title: string; date: string }[];
  activeFriends?: number;
};

export type Idea = {
  id: string;
  text: string;
  name?: string;
  /** ログインして出した人。自分のかどうかを見分けるのに使う */
  byUid?: string;
  votes: number;
  createdAt: string;
  status?: "open" | "picked" | "done";
};

export type NextNote = { id: string; planId: string; text: string; createdAt: string };

/**
 * 島に名前を出すと決めた住人。何もしていない人はここに出てこない。
 *
 * **キャラクターの絵ではなく YouTube のチャンネルで返る。** どの絵が誰のものかは
 * あやとが表で持っていて `content/residents.ts` に焼いてあるので、突き合わせは
 * こちら側でやる。本人に絵を選ばせると、他人の絵を自分のものにできてしまう。
 *
 * `uid` も返る。「いま島にいる人」（`lib/here.ts`）は `islandHere/{uid}` に居場所しか
 * 書かないので、誰なのかはここと突き合わせて決める。ここに載っているのは
 * 「名前かアイコンを出してよい」と本人が言った人だけ。
 */
export type ResidentShow = {
  uid?: string;
  channelId: string;
  name?: string | null;
  photo?: string | null;
};

/**
 * 北欧旅の、日付で言える事実。
 *
 * **旅の終わりは、旅の途中に起きる。** そのときあやとはヒッチハイクの
 * 途中にいて、Git を編集して commit して Hosting を手で起動する、は回らない
 * （`docs/nordic-depart.md`）。だから着いた日はここから届く。
 */
export type NordicFacts = {
  /** ストックホルムに着いた日(YYYY-MM-DD)。着くまでは無い */
  arrivedOn?: string;
  /**
   * 旅が終わった日(YYYY-MM-DD)。**着いた日とは別。**
   *
   * あやとの言葉（2026-09-06）「ストックホルム出るまでが北欧旅です」。
   * 9月20日に着いて、そこから7泊して27日に発つ。着いた日で終わらせると、
   * いちばん長い滞在がまるごと「もう行ってきた」になる。
   */
  endedOn?: string;
};

export type IslandState = {
  current?: Partial<IslandCurrent>;
  stats?: Partial<IslandStats>;
  ideas?: Idea[];
  notes?: NextNote[];
  residents?: ResidentShow[];
  nordic?: NordicFacts;
};

/** 端末ごとの ID。1人1票と連投制限のために使う（ログインはしない）。 */
export function clientId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "ayato-island-cid";
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

/** ログインしている人の合言葉。付いていればサーバー側が本人として扱う。 */
const auth = (token?: string | null): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export const getState = () => req<IslandState>("/state");

/** 島での見え方。名前もアイコンも、出すか出さないかは本人が決める。 */
export type MeSettings = {
  /* キャラクターは本人に選ばせない。割り当てはあやとの表が決める
     （`content/residents.ts` の channel）。他人の絵を自分のものに
     できてしまうため。ログインで本人が決めるのは、この下の3つだけ。 */
  /** 本名以外で呼ばれたいときの名前 */
  nickname?: string | null;
  showName?: boolean;
  showPhoto?: boolean;
};

/** 企画ページの下書き。あやとが「書いていいよ」と決めた人だけが書ける。 */
export type PlanDraft = {
  id?: string;
  title: string;
  when: string;
  date: string;
  note: string;
  tags: string[];
  place: { name: string; area: string; map: string };
  about: string[];
  links: { label: string; href: string }[];
  photos: { src: string; alt: string; credit: string; creditHref: string }[];
  embeds: { kind: "instagram" | "youtube"; id: string; note: string }[];
  by?: string;
  updatedAt?: number;
};

export const getDrafts = (token: string) =>
  req<{ drafts: PlanDraft[] }>("/drafts", { headers: auth(token) });

export const saveDraft = (d: PlanDraft, token: string) =>
  req<{ id: string; draft: PlanDraft }>("/drafts", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(d),
  });

/** 島での見え方を保存する。ログインしていないと使えない。 */
export const saveMe = (s: MeSettings, token: string) =>
  req<MeSettings & { uid: string }>("/me", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(s),
  });
export const getIdeas = () => req<{ ideas: Idea[] }>("/ideas");
export const postIdea = (text: string, name?: string, token?: string | null) =>
  req<{ idea: Idea }>("/ideas", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text, name, cid: clientId() }),
  });
export const voteIdea = (id: string, token?: string | null) =>
  req<{ votes: number }>(`/ideas/${id}/vote`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ cid: clientId() }),
  });
export const postNote = (planId: string, text: string, token?: string | null) =>
  req<{ note: NextNote }>("/notes", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ planId, text, cid: clientId() }),
  });

/* ---------------- テーマ付きの付箋（#160） ----------------
   宛先（テーマ）を持つ付箋。ハートが押せて、あやとが1つだけ返信できて、
   あやとがしまえる（消えない・戻せる）。

   **旧来の `/notes`（企画に貼る付箋）とは口が別。** 入れ物は同じだが、
   あちらは `planId`、こちらは `theme` を持つ。画面を切り替えている
   途中の日に、両方が混ざったものが両方の画面に出るのを止めるため。 */

/** 貼られた付箋1枚。 */
export type Sticky = {
  id: string;
  /** 宛先。`content/themes.ts` の id */
  theme: string;
  text: string;
  /** 名乗った名前。名乗っていなければ無い */
  by?: string;
  hearts: number;
  /** 運営者が立てた付箋か。おたずねの選択肢はこれ */
  byOwner: boolean;
  /** あやとからの返信。1枚につき1つ */
  reply?: string;
  repliedAt?: string;
  /** しまってあるか。戻す画面でしか返ってこない */
  archived?: boolean;
  createdAt: string;
};

/**
 * 付箋を読む。
 *
 * `theme` を渡さないと、テーマ横断の新着になる（掲示板はこちらを1回だけ引いて、
 * テーマごとの札の数も、選んだテーマの中身も、同じ1回から出す）。
 */
export const getStickies = (o?: {
  theme?: string;
  /** ハートの多い順にする。テーマを1つに絞ったときだけ効く */
  byHearts?: boolean;
  limit?: number;
}) => {
  const q = new URLSearchParams();
  if (o?.theme) q.set("theme", o.theme);
  if (o?.byHearts) q.set("sort", "hearts");
  if (o?.limit) q.set("limit", String(o.limit));
  const s = q.toString();
  return req<{ notes: Sticky[]; more: boolean; next: string | null }>(
    `/stickies${s ? `?${s}` : ""}`,
  );
};

/** しまってある付箋を読む。**あやとだけ。** 戻すときにしか使わない。 */
export const getArchivedStickies = (token: string, theme?: string) =>
  req<{ notes: Sticky[] }>(
    `/stickies?archived=1${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`,
    { headers: auth(token) },
  );

/** 貼る。名前は書かなくていい（ログインしていれば島に出す名前が入る）。 */
export const postSticky = (
  p: { theme: string; text: string; by?: string; byOwner?: boolean },
  token?: string | null,
) =>
  req<{ note: Sticky }>("/stickies", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ ...p, cid: clientId() }),
  });

/** ハートを押す。**もう一度押すと外れる。** 返るのは押したあとの数と、いまの状態。 */
export const heartSticky = (id: string, token?: string | null) =>
  req<{ hearts: number; on: boolean }>(`/stickies/${id}/heart`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ cid: clientId() }),
  });

/** 返信する。**あやとだけ。** 空で送ると取り消し。書き直せば上書き。 */
export const replySticky = (id: string, text: string, token: string) =>
  req<{ reply: string | null; repliedAt: string | null }>(
    `/stickies/${id}/reply`,
    { method: "POST", headers: auth(token), body: JSON.stringify({ text }) },
  );

/** しまう・戻す。**あやとだけ。消えない。** ハートの数はそのまま残る。 */
export const archiveSticky = (id: string, on: boolean, token: string) =>
  req<{ id: string; archived: boolean }>(`/stickies/${id}/archive`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ on }),
  });

/**
 * 自分がハートを押した付箋。
 *
 * **解除できるので、サーバーの数だけでは「自分が押したか」が分からない。**
 * 押したかどうかを毎回サーバーに聞くと、一覧を出すのにもう1往復要るうえ、
 * ログインしていない人のぶんは端末IDを送ることになる。押した瞬間の返事
 * （`heartSticky` の `on`）をここに写して、次に来たときも赤いままにする。
 */
const HEARTED = "ayato-island-hearted";

export function heartedLocally(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(HEARTED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function rememberHeart(id: string, on: boolean) {
  try {
    const s = heartedLocally();
    if (on) s.add(id);
    else s.delete(id);
    localStorage.setItem(HEARTED, JSON.stringify([...s]));
  } catch {
    /* localStorage が使えない環境では諦める。サーバー側には残っている */
  }
}

/** 自分が投票した企画（サーバーにも記録するが、UIの即時反映用にローカルにも持つ） */
export function votedLocally(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem("ayato-island-voted") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function rememberVote(id: string) {
  try {
    const s = votedLocally();
    s.add(id);
    localStorage.setItem("ayato-island-voted", JSON.stringify([...s]));
  } catch {
    /* localStorage が使えない環境では諦める */
  }
}

/* ---------------- 今夜のおたずね ----------------
   参加のいちばん下の段。文章を書かずに、押すだけで数字が動く。
   「さんせい」は誰かが企画を書かないと押すものが無いが、
   こちらはこちらから問いを出しているので、掲示板が空でも押せる。 */

export type PollOption = { id: string; label: string; votes: number };

export type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  /** 全部の票を足した数。棒の長さはこれで割って出す */
  total: number;
  /** 締め切り。過ぎたものはサーバー側が返さない */
  openUntil: string | null;
};

export const getPoll = () => req<{ poll: Poll | null }>("/poll");

/** 押す。1人1票なので、2回目からは押し直しにならず、いまの数だけ返る。 */
export const votePoll = (id: string, option: string, token?: string | null) =>
  req<{ poll: Poll; mine: string }>(`/poll/${id}/vote`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ option, cid: clientId() }),
  });

/**
 * どの問いで、どれを押したか。
 *
 * サーバーにも残っているが、それを引くにはもう1往復要る。
 * 次に来たときに棒がすぐ出ているほうが「自分の1票が残っている」と分かるので、
 * ここにも持つ。問いは同時に1つしか出ないので、ひとつぶんだけで足りる。
 */
const POLL_MINE = "ayato-island-poll";

export function pollAnswer(id: string): string | null {
  try {
    const [pid, option] = (localStorage.getItem(POLL_MINE) ?? "").split("\t");
    return pid === id ? option || null : null;
  } catch {
    return null;
  }
}

export function rememberPollAnswer(id: string, option: string) {
  try {
    localStorage.setItem(POLL_MINE, `${id}\t${option}`);
  } catch {
    /* localStorage が使えない環境では諦める。サーバー側には残っている */
  }
}

/* ---------------- 北欧旅のわかれ道 ----------------
   区間ごとの「どっちにしてほしい？」。押すだけで答えられる、参加のいちばん下の段。
   問いの字と選択肢の字は `content/nordic.ts` にあって、ここでやりとりするのは
   id と数だけ（`docs/nordic-fund.md` 提案8）。 */

/** 札ごとに、何人が押したか。押されていない札は入っていない。 */
export type ForkCounts = Record<string, number>;

/**
 * わかれ道の数を、知っている id のぶんだけ読む。
 * 一覧では取らない。知らない id を混ぜ込まれても、画面に出ないようにするため。
 */
export const getForks = (ids: string[]) =>
  req<{ forks: Record<string, ForkCounts> }>(
    `/fork?ids=${encodeURIComponent(ids.join(","))}`,
  );

/** 押す。1人1票なので、2回目からは押し直しにならず、いまの数だけ返る。 */
export const voteFork = (id: string, option: string, token?: string | null) =>
  req<{ id: string; votes: ForkCounts; mine: string }>(`/fork/${id}/vote`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ option, cid: clientId() }),
  });

/**
 * どのわかれ道で、どれを押したか。
 *
 * 「今夜のおたずね」（`POLL_MINE`）と分けてある。あちらは同時に1つしか出ないので
 * 1つぶんで足りるが、わかれ道は6つが何か月も並んだままになる。
 * サーバーにも残っているが、引くにはもう1往復要る。次に来たときに
 * 自分の1票がそこにあると分かるほうが、次も押す気になる。
 */
const FORK_MINE = "ayato-nordic-fork";

function forkStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(FORK_MINE) ?? "";
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.split("\t"))
        .filter((p) => p.length === 2 && p[0] && p[1]),
    );
  } catch {
    return {};
  }
}

export function forkAnswer(id: string): string | null {
  return forkStore()[id] ?? null;
}

export function rememberForkAnswer(id: string, option: string) {
  try {
    const all = { ...forkStore(), [id]: option };
    // 区間は10しかないので、増え続けることはない。それでも上限は置いておく
    const lines = Object.entries(all)
      .slice(-20)
      .map(([k, v]) => `${k}\t${v}`);
    localStorage.setItem(FORK_MINE, lines.join("\n"));
  } catch {
    /* localStorage が使えない環境では諦める。サーバー側には残っている */
  }
}

/* ---------------- 今日、島に来た人 ----------------
   「誰かがそこにいる」を出す（`docs/island-play.md` 仕掛け16）。
   同時接続は出さない。作れないうえに、たいていの時間帯は「1人」と出て、
   1人と出た瞬間にこの島は寂れて見える。日単位なら数十〜数百になる。 */

/** 数えた日と、そのときの人数。日付はサーバーが決めた「島の1日」。 */
const VISIT_MINE = "ayato-island-visit";

/**
 * 島の「1日」。サーバー側の `today()` と同じで、UTC で切る。
 *
 * 日本時間の朝9時で変わるので、配信の一晩（22時〜25時）が1日の中に収まる。
 * 画面に出す日付は JST（`lib/nightly.ts`）だが、数える側の1日はこちら。
 */
const islandDay = () => new Date().toISOString().slice(0, 10);

/** 前に数えた日と、そのときの人数。今日ぶんが残っていれば、もう叩かない。 */
function visitRemembered(): { day: string; n: number } | null {
  try {
    const [day, n] = (localStorage.getItem(VISIT_MINE) ?? "").split("\t");
    return day && n ? { day, n: Number(n) } : null;
  } catch {
    return null;
  }
}

/**
 * 今日ここに来た人の数。**1日1回しか数えない。**
 *
 * その日2回目からはサーバーに聞かず、最初に来たときの数をそのまま返す。
 * 人数は増える一方なので、少し前の数を出しても嘘にはならない（実際より小さいだけ）。
 * 毎回聞きにいくと、島を開くたびに Functions が1回動くことになる。
 *
 * 数えられなかった日は null。島の中でサーバーの失敗を見せない。
 */
export async function countVisit(token?: string | null): Promise<number | null> {
  const had = visitRemembered();
  if (had && had.day === islandDay() && Number.isFinite(had.n)) return had.n;
  try {
    const r = await req<{ day: string; visits: number }>("/visit", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ cid: clientId() }),
    });
    try {
      localStorage.setItem(VISIT_MINE, `${r.day}\t${r.visits}`);
    } catch {
      /* 覚えられなくても、次に来たときにもう一度数えられるだけ */
    }
    return r.visits;
  } catch {
    return null;
  }
}


/* ---------------- 北欧旅の、その日の写真 ----------------
   その日が終わったら、あやとが写真を貼る。見た人は持って帰れて、
   持って帰るときに、その日いた人のキャラクターを1人だけ入れられる
   （`docs/nordic-photos.md`）。

   **写真のある日しか返ってこない。** 旅は10日あるが、まだ何も起きていない
   日に「まだありません」を並べても、読む人には何も無い。 */

/** 貼ってある1枚。`w` `h` は焼いたあとの寸法（長辺1600px）。 */
export type NordicPhoto = {
  id: string;
  day: string;
  url: string;
  w: number;
  h: number;
  note: string;
  at: number;
};

/**
 * その日の配信でスパチャしてくれた人。
 *
 * **どの絵の人かは、ここでは決まらない。** 返るのは YouTube のチャンネルで、
 * 絵との対応は `content/residents.ts` にある（`ResidentShow` と同じ考え方）。
 * Doneru の人はチャンネルが分からないことがあるので、
 * そのときだけ手入れで `icon` が直に入る（`python/admin/nordic_supporter.py`）。
 */
export type NordicSupporter = {
  channelId?: string | null;
  icon?: string | null;
  name?: string | null;
};

/** 1日ぶん。写真と、その日いた人。 */
export type NordicPhotoDay = {
  day: string;
  photos: NordicPhoto[];
  people: NordicSupporter[];
};

/**
 * いま入っているのがあやとか。
 *
 * `/me` は「ログインした人を覚えておく」ための口で、返事に `admin` が乗っている。
 * **これは画面に道具を出すかどうかだけに使う。** 実際に貼れるかどうかは
 * 貼る側の口がもう一度見ているので、ここを騙しても写真は貼れない。
 */
export const amIOwner = async (token: string): Promise<boolean> => {
  try {
    const r = await req<{ admin?: boolean }>("/me", {
      method: "POST",
      headers: auth(token),
      body: "{}",
    });
    return !!r.admin;
  } catch {
    return false;
  }
};

export const getNordicPhotos = () =>
  req<{ days: NordicPhotoDay[] }>("/nordic/photos");

/**
 * 写真を貼る。**あやとだけ。**
 *
 * 送るのは、ブラウザで長辺1600pxの webp に焼いたあとのもの
 * （`components/nordic/stamp.ts` の `shrink`）。元のままの写真は送らない。
 * 10日ぶん何枚でも貼るので、元のままだと置き場も回線も持たない。
 */
export const postNordicPhoto = (
  p: { day: string; image: string; w: number; h: number; note?: string },
  token: string,
) =>
  req<{ photo: NordicPhoto }>("/nordic/photos", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(p),
  });

/** 間違えて貼った1枚を消す。**あやとだけ。** 置き場の実体ごと消える。 */
export const deleteNordicPhoto = (id: string, token: string) =>
  req<{ id: string }>(`/nordic/photos/${id}`, {
    method: "DELETE",
    headers: auth(token),
  });


/* ---------------- 北欧旅の、その日に起きたこと ----------------
   `content/nordic.ts` の `NORDIC_LOG` は Git にあって、直すには commit して
   Hosting を手で起動しないと出ない。**旅の最中のあやとには、それは回らない。**
   だから旅のあいだは、ここから読む（`docs/nordic-depart.md`）。 */

/** 1日ぶんの「起きたこと」。`day` は旅程表の行の id（`day-1` `day-depart`）。 */
export type NordicLogEntry = {
  day: string;
  /** その日が実際に何日だったか(YYYY-MM-DD)。あとから入る事実 */
  date?: string;
  /** 何が起きたか。スマホから打つので短い */
  body: string;
  /** その日の配信。YouTube の videoId */
  video?: string;
  at?: number;
};

export const getNordicLog = () => req<{ log: NordicLogEntry[] }>("/nordic/log");

/** その日に起きたことを書く。**あやとだけ。** 同じ日に書くと上書きになる。 */
export const postNordicLog = (
  e: { day: string; date?: string; body: string; video?: string },
  token: string,
) =>
  req<{ log: NordicLogEntry }>("/nordic/log", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(e),
  });

/** 書いたものを消す。**あやとだけ。** */
export const deleteNordicLog = (day: string, token: string) =>
  req<{ day: string }>(`/nordic/log/${day}`, { method: "DELETE", headers: auth(token) });

/**
 * ストックホルムに着いた、を記録する。**あやとだけ。**
 *
 * **これは旅の終わりではない。** 着いてから7泊して、そこから発つ
 * （`postNordicEnded`）。`date` を空にすると取り消せる。
 */
export const postNordicArrived = (date: string, token: string) =>
  req<{ arrivedOn: string }>("/nordic/arrived", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ date }),
  });

/**
 * 旅が終わった（ストックホルムを発った）、を記録する。**あやとだけ。**
 *
 * ここが入ると、企画が「いま行っている」から「行ってきた」に変わる
 * （`content/plans.ts` の `planPhase`）。`date` を空にすると取り消せる。
 */
export const postNordicEnded = (date: string, token: string) =>
  req<{ endedOn: string }>("/nordic/ended", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ date }),
  });
