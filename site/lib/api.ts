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
  /**
   * 直近の配信5本（新しい順）。
   *
   * **鍵は `video_id`。** ここは長らく `videoId` と書いてあったが、
   * 入れているのは BigQuery の `SELECT AS STRUCT video_id, ...` を
   * そのまま焼いた形（`python/island_daily_stats.py`）で、**本番は
   * ずっと `video_id` を返している。** 誰も読んでいなかったので気づかれず、
   * 最初に読んだ画面が `undefined` の動画IDでサムネイルを引くところだった。
   */
  latest?: { video_id: string; title: string; date: string }[];
  activeFriends?: number;
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
  notes?: NextNote[];
  residents?: ResidentShow[];
  /**
   * 「一緒にいた日数」（#91）。チャンネルID -> 日数。
   *
   * 毎晩 BigQuery から数え直して `islandChannels` に入っているもの。
   * **画面はこれを次に開いたときのために控える。その場では差し替えない**
   * （`lib/residentDays.ts` に理由）。
   */
  residentDays?: Record<string, number>;
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

/* 企画ページの下書き（`islandDrafts`）を読み書きするところは、ここから消えた。
   役目は下の `islandNextPlans`（#161）に移っている。**サーバーの口
   （`GET/POST /island-api/drafts`）はまだ動いている**が、画面から呼ぶ道は1本にする。
   2本あると、同じものを2つの入れ物に書ける日が来る。 */

/* ---------------- 企画（#161） ----------------
   **「一言の提案」と「ページ1枚の下書き」を1つにした入れ物**（`islandNextPlans`）。
   前は `islandIdeas`（120字・ログイン不要）と `islandDrafts`（12,000字・ログイン必須）に
   割れていて、一言を出したあと下書きへ進む道が無かった。同じものの粒度違いなので、
   題1つで出して、あとから日付・場所・本文・リンク・写真を足して育てる形にする。

   ログインは要らない。だから「あとから直せる」の本人確認は端末の印（`cid`）になる。
   ログインしていれば `uid` で守り、していなければ **24時間だけ**（あやと承認済み）。 */

/** 企画の段。**提案 → これから → やった が1本。** */
export type PlanStatus = "proposed" | "next" | "done";

/** 段の呼び名。入れ物には英字で入れて、画面に出す字はここが持つ。 */
export const PLAN_STATUS_NAME: Record<PlanStatus, string> = {
  proposed: "提案",
  next: "これから",
  done: "やった",
};

/** 出された企画1つ。**題以外はぜんぶ空でもよい。** */
export type NextPlan = {
  id: string;
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
  /** 名乗った名前 */
  by?: string;
  /** ログインして出した人。じぶんのかどうかを見分けるのに使う */
  byUid?: string;
  hearts: number;
  status: PlanStatus;
  /** ページとして立ったときの、Git 側の企画の id（`content/plans.ts`・`content/legends.ts`） */
  planId?: string;
  /**
   * この企画のものだと決めた配信（#202）。**あやとしか足せない。**
   *
   * 配信日の境目は日本時間の0時で、そこをまたいで配信が2本に割れた夜は、
   * 後半が日付では当たらない。**後半の動画IDをここに足さないと、
   * 後半に投げてくれた人にカードが渡らない**（2026-09-06 に実際に起きた）。
   */
  videoIds?: string[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 書くときに送る中身。id を付けると、その企画を育てる。 */
export type NextPlanInput = Omit<
  NextPlan,
  | "id"
  | "hearts"
  | "status"
  | "byUid"
  | "createdAt"
  | "updatedAt"
  | "archived"
  | "planId"
  /* 育てる口（`saveNextPlan`）から送らない。あちらは送った中身でまるごと
     置き換わるので、企画を1文字直すたびに配信の紐付けが消える。
     足すのは専用の口（`setPlanVideos`）だけ。 */
  | "videoIds"
> & { id?: string };

/** 何も書いていない企画。画面の初期値もサーバーの返す形も、これと同じ形。 */
export const EMPTY_PLAN: NextPlanInput = {
  title: "",
  when: "",
  date: "",
  note: "",
  tags: [],
  place: { name: "", area: "", map: "" },
  about: [],
  links: [],
  photos: [],
  embeds: [],
};

export const getNextPlans = (limit = 200) =>
  req<{ plans: NextPlan[]; more: boolean; next: string | null }>(
    `/nextplans?limit=${limit}`,
  );

/** しまってある企画を読む。**あやとだけ。** 戻すときにしか使わない。 */
export const getArchivedPlans = (token: string) =>
  req<{ plans: NextPlan[] }>("/nextplans?archived=1", { headers: auth(token) });

/**
 * 運営側の企画も混ぜて読む（#202）。
 *
 * 掲示板（`getNextPlans`）に出るのは、みんなが出した提案だけ。
 * **北欧◯日目もフードワインフェスも、あちらには出てこない。**
 * 配信を結ぶ相手はたいていそちらなので、`/me` の道具はここから引く。
 */
export const getStreamEventPlans = (limit = 200) =>
  req<{ plans: NextPlan[]; more: boolean; next: string | null }>(
    `/nextplans?limit=${limit}&events=1`,
  );

/**
 * その企画のものだと決めた配信を入れ替える。**あやとだけ。**
 *
 * **足す・外すではなく、送った一覧でまるごと置き換わる。**
 * だから画面は、いま入っているものを先に出してから送る。
 * 打ち間違えた1本を外す道が要るし、一覧で持つほうが画面が単純になる。
 */
export const setPlanVideos = (id: string, videoIds: string[], token: string) =>
  req<{ plan: NextPlan }>(`/nextplans/${id}/videos`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ videoIds }),
  });

/**
 * 打たれた字から YouTube の動画IDを取り出す。
 *
 * **スマホで11文字を打たせない。** 旅の途中に開くのは YouTube Studio か
 * 配信のページで、そこから出てくるのは URL。`watch?v=` も `youtu.be/` も
 * `live/` も `shorts/` も、埋め込みの URL も、同じ形（11文字）で入っている
 * ので、そこだけを拾う。
 *
 * 送る側（`POST /nextplans/{id}/videos`）も同じことをしているが、
 * **打ったその場で「この id になります」と見せたい**のでこちらにも置く。
 * 送ってから返事で気づくのでは、電波の細いところでは遅い。
 */
export function videoIdOf(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  const hit = /([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/.exec(s);
  return hit ? hit[1] : null;
}

export const getNextPlan = (id: string) =>
  req<{ plan: NextPlan }>(`/nextplans/${id}`);

/** 出す。**題だけでいい。** */
export const postNextPlan = (p: NextPlanInput, token?: string | null) =>
  req<{ plan: NextPlan }>("/nextplans", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ ...p, cid: clientId() }),
  });

/** 育てる。送った中身でまるごと置き換わるので、**必ず全部を持って開く。** */
export const saveNextPlan = (id: string, p: NextPlanInput, token?: string | null) =>
  req<{ plan: NextPlan }>(`/nextplans/${id}`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ ...p, cid: clientId() }),
  });

/** ハートを押す。**付箋とまったく同じ。** もう一度押すと外れる。 */
export const heartNextPlan = (id: string, token?: string | null) =>
  req<{ hearts: number; on: boolean }>(`/nextplans/${id}/heart`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ cid: clientId() }),
  });

/** 段を進める。**あやとだけ。** ページとして立ったら Git 側の id で結ぶ。 */
export const setPlanStatus = (
  id: string,
  status: PlanStatus,
  planId: string,
  token: string,
) =>
  req<{ plan: NextPlan }>(`/nextplans/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status, planId }),
  });

/** しまう・戻す。**あやとだけ。消えない。** */
export const archiveNextPlan = (id: string, on: boolean, token: string) =>
  req<{ id: string; archived: boolean }>(`/nextplans/${id}/archive`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ on }),
  });

/**
 * じぶんが出した企画。
 *
 * ログインしていない人には、端末に残したこの控えしか手がかりが無い。
 * **これはサーバーの鍵ではない。** 実際に直せるかどうかは、送った端末IDを
 * サーバーがもう一度見て決める。ここにあるのは「直すボタンを出すかどうか」だけ。
 */
const MY_PLANS = "ayato-island-myplans";

export function myPlans(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(MY_PLANS) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function rememberMyPlan(id: string) {
  try {
    const s = myPlans();
    s.add(id);
    localStorage.setItem(MY_PLANS, JSON.stringify([...s]));
  } catch {
    /* localStorage が使えない環境では諦める。直すボタンが出なくなるだけ */
  }
}

/**
 * ログインしていない人が、自分の企画を直せる時間。
 * サーバー側の `PLAN_EDIT_MS` と同じ値を持つ。**片方だけ変えない。**
 */
export const PLAN_EDIT_MS = 24 * 60 * 60 * 1000;

/** あと何時間直せるか。過ぎていれば 0。 */
export const planEditHoursLeft = (p: NextPlan, now = Date.now()): number =>
  Math.max(0, Math.ceil((Date.parse(p.createdAt) + PLAN_EDIT_MS - now) / 3600000));

/**
 * 直せるか。**サーバーの判定と同じことを、画面の側でも言えるようにする。**
 *
 * ここで嘘をつくと「直す」を押したあとに 403 が返る。押す前に言う。
 * @param p 企画
 * @param uid ログインしている人（していなければ null）
 * @param mine 端末に残した控え
 */
export function canEditPlan(
  p: NextPlan,
  uid: string | null | undefined,
  mine: Set<string>,
  now = Date.now(),
): "ok" | "expired" | "no" {
  // ログインして出したものは、端末の印では直せない。印のほうが弱い証なので
  if (p.byUid) return p.byUid === uid ? "ok" : "no";
  if (!mine.has(p.id)) return "no";
  return Date.parse(p.createdAt) + PLAN_EDIT_MS > now ? "ok" : "expired";
}

/** 島での見え方を保存する。ログインしていないと使えない。 */
export const saveMe = (s: MeSettings, token: string) =>
  req<MeSettings & { uid: string }>("/me", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(s),
  });
/* 企画提案（`islandIdeas`）を読み書きするところは、ここから消えた（#161）。
   `Idea` の型も落とした（#171）。`/state` がもう `ideas` を返さない。
   入れ物の8件は #162 で付箋へ移してあって、Firestore には残っている
   （書いた人の字なので消さない）。 */
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

/**
 * じぶんが貼った付箋。**ログインして貼ったものだけ。**
 *
 * 一覧の口は誰が貼ったかを返さない（返すと、同じ人の付箋を並べて数えられる）。
 * だから「自分のぶん」はサーバー側で絞る。ログインせずに貼ったものは、
 * こちらから見分けようがないので出てこない。
 */
export const getMyStickies = (token: string) =>
  req<{ notes: Sticky[] }>("/stickies?mine=1", { headers: auth(token) });

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
 * サーバーが覚えている「わたし」。
 *
 * 名前とアイコンは Firebase のログインからも取れるが、**チャンネルと
 * 島での見え方はここにしか無い。** `useAuth` の `channelId` は
 * ログインを押した瞬間にしか入らないので、次に来た人の画面では空になる。
 * じぶんのこと（`/me`）はここを引いて、キャラクターを突き合わせる。
 */
export type Me = {
  uid: string;
  name: string;
  channelId?: string;
  /** ログインしたときの写真。**押した瞬間のもので、そのあと古くなる** */
  photo?: string;
  /**
   * YouTube のプロフィール写真。**`islandChannels.photo`（#202）。**
   *
   * 日次のジョブ（`python/island_channel_photos.py`）が入れ直すので、
   * 本人が YouTube でアイコンを替えても翌日には追いつく。上の `photo` は
   * ログインを押した日のまま止まるので、あればこちらを先に使う。
   *
   * **カードに乗るキャラクターの絵とは別物。混ぜない。**
   * あちらはあやとの表が決めた割り当て（`content/residents.ts`）で、
   * YouTube を更新しても変わらないのが正しい。
   */
  channelPhoto?: string | null;
  nickname: string | null;
  showName: boolean;
  showPhoto: boolean;
  /** あやとか。**画面に道具を出すかどうかだけに使う。** */
  admin: boolean;
};

/** 覚えているものを読む。空で送ると、書きかえずに今のものが返る。 */
export const loadMe = (token: string) =>
  req<Me>("/me", { method: "POST", headers: auth(token), body: "{}" });

/**
 * いま入っているのがあやとか。
 *
 * `/me` は「ログインした人を覚えておく」ための口で、返事に `admin` が乗っている。
 * **これは画面に道具を出すかどうかだけに使う。** 実際に貼れるかどうかは
 * 貼る側の口がもう一度見ているので、ここを騙しても写真は貼れない。
 */
export const amIOwner = async (token: string): Promise<boolean> => {
  try {
    return !!(await loadMe(token)).admin;
  } catch {
    return false;
  }
};

/**
 * いま、どこにいるか。**あやとだけ。**
 *
 * 旅の途中に書きかえる（島の景色・`/now`・北欧の面が、みなここを読む）。
 *
 * `week`（今週やること）は**渡したときだけ**書き替わる。渡さなければ島に
 * 入っているものがそのまま残る。**空の配列を渡すと消える。**
 * 日付印だけ新しくなって中身が先週のまま、というのがいちばん悪いので、
 * せめて消せるようにしてある。
 */
export const postCurrent = (
  c: { place: string; word?: string; theme?: string; week?: string[] },
  token: string,
) =>
  req<{ current: Partial<IslandCurrent> }>("/current", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(c),
  });

export const getNordicPhotos = () =>
  req<{ days: NordicPhotoDay[] }>("/nordic/photos");

/**
 * その日に立っている企画（#202）。**写真を貼るときに選ぶための一覧。**
 *
 * **1日に企画は何本でも立つ。** 9月11日は4本で、ジョージアバイバイ・
 * 海外出発二周年・ヒッチハイクで北欧へ・北欧旅の出発が同じ日に乗る。
 * だから1本に決めて返ってこない。決めるのは画面（と、あやと）。
 */
export type StreamEventBrief = { id: string; title: string; date: string };

export const getStreamEvents = (day: string) =>
  req<{ day: string; events: StreamEventBrief[] }>(
    `/streamevents?day=${encodeURIComponent(day)}`,
  );

/**
 * 写真を貼る。**あやとだけ。**
 *
 * 送るのは、ブラウザで長辺1600pxの webp に焼いたあとのもの
 * （`components/nordic/stamp.ts` の `shrink`）。元のままの写真は送らない。
 * 10日ぶん何枚でも貼るので、元のままだと置き場も回線も持たない。
 *
 * `streamEventId` を付けると、その企画の画像になる（#202）。
 * **付けないと、その日のいちばん古い企画に付く。** 1日に企画が何本も
 * 立つ日は、そこで黙って別の企画に付くので、画面から選んで送る。
 */
export const postNordicPhoto = (
  p: {
    day: string;
    image: string;
    w: number;
    h: number;
    note?: string;
    streamEventId?: string;
  },
  token: string,
) =>
  /* 返事にはその日の企画も乗っている。貼ったあとに「どれに付いたか」を
     出せるようにするため（`events`）。 */
  req<{ photo: NordicPhoto; events?: StreamEventBrief[] }>("/nordic/photos", {
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


/* ---------------- あやと島カード(#173) ----------------
   その日に投げ銭してくれた人が、その日の写真を1枚もらう。
   焼き込もうがしまいが、もらった扱いになる(あやとの言葉)。

   **配られてはいない。** サーバーは、その日の写真とその日の名簿から
   引くたびに組み立てている（`functions/src/cards.ts` 冒頭）。名簿は
   BigQuery から翌朝に入るので、「貼った瞬間に配る」だと、その日ぶんが
   永久に0枚になる。 */

/** カード1枚。**置き場にこの形では入っていない。組み立てたもの。** */
export type IslandCard = {
  id: string;
  /** その日(YYYY-MM-DD)。企画はこの日付で引く */
  day: string;
  photoId: string;
  url: string;
  w: number;
  h: number;
  note: string;
  /** もらった人の YouTube チャンネル。Doneru の人は null で、持ち主が分からない */
  channelId: string | null;
  /** 名簿が絵まで持っていたときだけ。ふつうは `content/residents.ts` で引く */
  icon: string | null;
  /** 島に名前を出してよいと言った人だけ */
  name: string | null;
  /** 写真の中のどこに立つか。0〜1 の割合。`y` は足元の高さ */
  x: number;
  y: number;
  rot: number;
  scale: number;
  /** 本人が動かしたか。既定のままなら false */
  moved: boolean;
  /** 写真が貼られた時刻。並べ替え済みなので、画面では並べ直さない */
  at: number;
  /**
   * どの企画の写真か（#202）。
   *
   * **札を出すのはこれではなく日付から。** 1枚の写真は1つの企画にしか
   * 付かないが、カードの足に出すのは**その日に立っていた企画ぜんぶ**で、
   * 9月11日はそれが4本ある。ここを札にすると、残りの3本が消える。
   */
  streamEventId?: string | null;
};

/** 配られたカードぜんぶ。**新しい順で返る。** */
export const getCards = () => req<{ cards: IslandCard[] }>("/cards");

/** カードの置き方。0〜1 の割合と、傾きと、大きさ。 */
export type CardPlace = { x: number; y: number; rot: number; scale: number };

/**
 * カードを動かす。**本人だけ**（あやとは全部動かせる）。
 *
 * 自分のカードかどうかは、送った値ではなく `islandUsers/{uid}.channelId` を
 * サーバーが見て決める。ここを騙しても他人のカードは動かない。
 */
export const moveCard = (id: string, place: CardPlace, token: string) =>
  req<CardPlace & { id: string; moved: boolean }>(`/cards/${id}`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(place),
  });


/* ---------------- 北欧旅の、その日に起きたこと ----------------
   `content/nordic.ts` の `NORDIC_LOG` は Git にあって、直すには commit して
   Hosting を手で起動しないと出ない。**旅の最中のあやとには、それは回らない。**
   だから旅のあいだは、ここから読む（`docs/nordic-depart.md`）。

   **読むだけ。** 入れるのは「管理スクリプトを実行」の `nordic_log`
   （`python/admin/nordic_log.py`）。書く口（`POST /nordic/log`）は
   Functions に残してあるが、画面からは叩かない。 */

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

/* ---------------- 配信のルーレット（#164） ----------------
   コントローラー（`/me/roulette`・あやとだけ）と、表示（`/roulette?s=…`・
   スマホ版 OBS）を、Firestore ごしに繋ぐ。

   **当たりはサーバーが決める。** ここから頼むのは「回して」までで、
   どれに決まったかは返ってくるほうにしか無い。ブラウザで決めていたころは、
   OBS を読み込み直すたびに結果が変わっていた。 */

/** ルーレットの選択肢1つ。手で足したものは名前もアイコンも空になる。 */
export type RouletteItem = {
  id: string;
  label: string;
  name: string;
  icon: string;
  /** あやとが手で足したもの。誰かが言ったように見せない印 */
  byHand: boolean;
};

export type RouletteSession = {
  id: string;
  status: "準備中" | "回っている" | "結果が出た";
  items: RouletteItem[];
  /** 結果が出てから配信にコメントするまでの秒（5/10/15） */
  wait: number;
  duration: number;
  turns: number;
  theme: string;
  sound: boolean;
  /** 当たった選択肢の id */
  result: string | null;
  /** 当たった選択肢が何番目か。輪を止める位置はこれで決まる */
  resultIndex: number | null;
  spunAt: number | null;
  postAt: number | null;
  posted: boolean;
  updatedAt: number;
};

/** 配信のチャットの1行。コントローラーに流れてくるもの。 */
export type ChatLine = {
  id: string;
  name: string;
  text: string;
  icon: string;
  channelId: string;
  at: number;
};

/**
 * コントローラーを開く。**あやとだけ。**
 *
 * id は作り直さない（OBS に貼った URL が変わってしまう）。
 * `clear` を付けたときだけ、選んであるものを空にして「はじめから」にする。
 * チャットの栞は開くたびに引き直すので、流れてくるのは**ここから先**のぶん。
 */
export const startRoulette = (token: string, clear = false) =>
  req<{ session: RouletteSession; live: boolean; doneru?: DoneruHint }>(
    "/roulette/start",
    {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ clear }),
    },
  );

/**
 * Doneru の鍵が入っているか。**鍵そのものは返ってこない。**
 *
 * 入れ直したいときに「いま入っているのはどれか」が分からないと困るので、
 * 末尾4文字だけが来る。
 */
export type DoneruHint = { set: boolean; tail: string };

/**
 * Doneru の鍵をしまう。**あやとだけ。** 空文字を送ると消える。
 *
 * 鍵は Firestore（`islandUsers/{uid}.doneruKey`）に入って、以後ここへは
 * 戻ってこない。**画面に焼かない**のが要点で、焼くと書き出したものから
 * 誰でも読めてしまう（`/roulette` の URL は配信の画面に映る）。
 */
export const putDoneruKey = (key: string, token: string) =>
  req<{ doneru: DoneruHint }>("/roulette/doneru", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ key }),
  });

/**
 * ブラウザから YouTube を直に読むための、寿命の短いトークン。**あやとだけ。**
 *
 * これで読むと、割り当てを食うのは Doneru 側のプロジェクトになる
 * （`lib/youtubeChat.ts` の冒頭）。鍵がまだ入っていなければ 404。
 * @param refresh 401 が出たとき。Doneru 側で取り直させてから返す
 */
export const getRouletteYtToken = (token: string, refresh = false) =>
  req<{ at: string; channel: string; expiresAt: number }>(
    "/roulette/yt-token",
    {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ refresh }),
    },
  );

/**
 * アラートボックス（OBS）に貼る URL の合言葉を出す。**あやとだけ。**（#180）
 *
 * 返るのは 32 桁の合言葉であって、**Doneru の鍵ではない。**
 * 鍵はサーバーに置いたままで、この画面にも書き出したものにも入らない。
 *
 * 作り直さないのが既定。毎回変わると、配信のたびに OBS の URL を
 * 貼り替えることになる。`fresh` を付けたときだけ作り直す
 * ——**合言葉が漏れたときの手当てがこれ。** Doneru の鍵のほうは
 * 作り直せない（あやとの言葉 2026-09-08）ので、こちらを替える。
 */
export const startAlertbox = (token: string, fresh = false) =>
  req<{ id: string; doneru: DoneruHint }>("/alertbox/session", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ fresh }),
  });

/** 表示側（OBS）が読むところ。**ログインが要らない唯一の口。** */
export const getRoulette = (id: string) =>
  req<{ session: RouletteSession; now: number }>(`/roulette/${id}`);

/** 新しく来たコメント。**栞が進むので、同じぶんは二度来ない。** */
export const readRouletteChat = (id: string, token: string) =>
  req<{ lines: ChatLine[]; wait: number; live: boolean; down?: boolean }>(
    `/roulette/${id}/comments`,
    { method: "POST", headers: auth(token), body: "{}" },
  );

/** 選択肢を置き換える。押す人は1人なので、丸ごと送るのがいちばん食い違わない。 */
export const putRouletteItems = (
  id: string,
  items: RouletteItem[],
  token: string,
) =>
  req<{ session: RouletteSession }>(`/roulette/${id}/items`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ items }),
  });

/** 待ち秒数・回る秒数・周・色。**URL を書き換える代わり。** */
export const putRouletteSettings = (
  id: string,
  s: Partial<Pick<RouletteSession, "wait" | "duration" | "turns" | "theme" | "sound">>,
  token: string,
) =>
  req<{ session: RouletteSession }>(`/roulette/${id}/settings`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(s),
  });

/**
 * 回す。**返事は、結果のコメントを投げ終わってから返る**（最長30秒ほど）。
 *
 * 待っているあいだも表示側は回っているので、押した側はこの返事を待たない。
 * 画面の状態は、表示側と同じように読み直して作る。
 */
export const spinRoulette = (
  id: string,
  wait: number,
  template: string,
  token: string,
) =>
  req<{ session: RouletteSession; posted: boolean }>(`/roulette/${id}/spin`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ wait, template }),
  });

/** 結果のコメントを投げ直す。もう投げてあれば、二度は投げない。 */
export const sayRouletteResult = (id: string, token: string) =>
  req<{ posted: boolean; already?: boolean }>(`/roulette/${id}/say`, {
    method: "POST",
    headers: auth(token),
    body: "{}",
  });

/* ---------------------------------------------------------------
   Doneru の投げ銭を、YouTube のアカウントにつなぐ（#190）。**あやとだけ。**

   Doneru はチャンネルIDを持っていない。持っているのは どねID と、
   Doneru に出ていた呼び名だけ。カードは YouTube のアカウントに配るので、
   ここを結ばないと、投げ銭してくれた人に何も渡らない。
   --------------------------------------------------------------- */

/** 対応表の状態。**「あとで引く」は無い。** 打ったその場で決まる。 */
export type DonorState = "new" | "unlinked" | "linked";

/** 対応表の1行。 */
export type Donor = {
  /** Doneru の どねID。**書類の id なので、直せない** */
  viewerPk: string;
  /** Doneru に出ていた呼び名 */
  label: string | null;
  /** つないだときに打った字 */
  handle: string | null;
  channelId: string | null;
  /** そのチャンネルがいま名乗っている名前 */
  channelName: string | null;
  state: DonorState;
  /** あやと本人。表には載るが、カードは渡さない */
  isOwner: boolean;
  note: string | null;
  firstSeenAt: string | null;
  editedAt: string | null;
  /** 画面から足した行か。**戻ってこない行だけ、消せる** */
  canDelete: boolean;
};

/** 何で引けたか。押した人に「何に繋がったか」を見せるために返る。 */
export type DonorVia = "id" | "dict" | "youtube";

/**
 * つないだ結果。
 *
 * **決まらなかったことを、例外にしない。** 「2人に使われている」も
 * 「見つからない」も、押した人が次にやることが変わるだけの、ふつうの返事。
 */
export type DonorLinked =
  | { ok: true; donor: Donor; via: DonorVia | null }
  | { ok: false; why: "duplicate" | "notfound" | "down" };

/** 対応表をぜんぶ読む。30行ほどなので、並べ替えはサーバー側で済んでいる。 */
export const getDonors = (token: string) =>
  req<{ donors: Donor[] }>("/donors", { headers: auth(token) });

async function postDonor(
  pk: string,
  body: Record<string, unknown>,
  token: string,
): Promise<DonorLinked> {
  try {
    const res = await fetch(`${API_BASE}/donors/${encodeURIComponent(pk)}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(token) },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as {
      donor?: Donor;
      via?: DonorVia | null;
      error?: string;
    } | null;
    if (res.ok && j?.donor) return { ok: true, donor: j.donor, via: j.via ?? null };
    const why = j?.error;
    return {
      ok: false,
      why: why === "duplicate" || why === "notfound" ? why : "down",
    };
  } catch {
    return { ok: false, why: "down" };
  }
}

/**
 * つなぐ。**打つのは表示名でも、貼り付けたチャンネルIDでもよい。**
 *
 * 引けたときだけ入る。引けなかったときは何も書かずに、なぜ駄目だったかが返る。
 */
export const linkDonor = (pk: string, handle: string, token: string) =>
  postDonor(pk, { handle }, token);

/**
 * この人は分からない、と決める。
 *
 * **消すのとは違う。** 分からないと決めたことも1つの答えなので、
 * 表に残す（残さないと、翌朝また「新規」として赤くなる）。
 */
export const unlinkDonor = (pk: string, token: string) =>
  postDonor(pk, { clear: true }, token);

/** 手で足した行を消す。**毎朝の取り込みが置いた行は消せない**（戻ってくる）。 */
export const dropDonor = (pk: string, token: string) =>
  req<{ deleted: string }>(`/donors/${encodeURIComponent(pk)}`, {
    method: "DELETE",
    headers: auth(token),
  });
