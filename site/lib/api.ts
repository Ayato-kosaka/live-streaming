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
 */
export type ResidentShow = { channelId: string; name?: string | null; photo?: string | null };

export type IslandState = {
  current?: Partial<IslandCurrent>;
  stats?: Partial<IslandStats>;
  ideas?: Idea[];
  notes?: NextNote[];
  residents?: ResidentShow[];
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

