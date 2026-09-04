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

/** 島に名前を出すと決めた住人。何もしていない人はここに出てこない。 */
export type ResidentShow = { icon: string; name?: string | null; photo?: string | null };

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
  /** 島にいる自分のキャラクター(Drive の画像ID)。選ばなければ名前は出ない。 */
  character?: string | null;
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
