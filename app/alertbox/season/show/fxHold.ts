/**
 * 段の演出の動画を**手元（Blob）に持つ**（2026-11-08 の配信から）。HTTP の控えには頼らない。
 *
 * ## なぜ控えに頼らないか
 *
 * 11/8 の配信（PRISM・Android の WebView・山の上のモバイル回線）で、7段の動画が1件も出なかった。それまでは温め
 * （`fetch(…, {cache:"force-cache"})`）で HTTP の控えに載せ、投げ銭が来たら動画の要素に元の URL を渡して、控えから読ませていた。
 * - 配りは `max-age=3600`（firebase.json）。開いて1時間たつと控えは古くなり、使うたびに問い合わせる。
 *   その日の最初の投げ銭は、開いてから 66 分後だった
 * - Android の WebView の控えは 20MB ほどで、古いものから捨てられる
 * - 温めは 12MB で止めていたので、段3〜7 の滞在は控えに一度も載っていなかった
 * 控えに無ければ、投げ銭が来てから回線で読む。下り 1.5Mbps では段1 の登場と滞在（0.7MB）だけで 4 秒かかり、
 * アラートは 1.5 秒で諦めていた（`index.tsx` の `HEAD_WAIT_MS` の頭）。
 *
 * ## 持ち方
 *
 * - 1本ずつ `fetch` → `Blob` にして、`URL.createObjectURL` の URL を `<video>` に渡す。Blob はブラウザの側（別プロセス）に
 *   置かれ、ページの JS の記憶には載らない。手放すまで捨てられない
 * - 上限は `FX_HOLD_BUDGET`。Chromium は Android で Blob を **端末の RAM の 1%** まで記憶に持ち、超えたぶんは端末の
 *   記憶域（6% まで）に逃がす（`storage/browser/blob/blob_memory_controller.cc` の `CalculateBlobStorageLimitsImpl`）。
 *   PRISM で配信する端末を 3GB 以上として 30MB、その 8 割の 24MB。11月の城は 7段の登場・滞在・締めの全部で 23.7MB
 * - 持つ順は段の出やすさ（安い段から。`fxHoldOrder`）。1段の登場と滞在がそろって、はじめてその段は手元から流せる
 * - 上限を超える本は持たない。投げ銭が来たら、その場で取り寄せて（`needFxVideos`）その1件だけで使い、流し終えたら手放す
 * - `<video>` が手元の URL を読めなかったものは手放し（`dropFxHeld`）、次の温めでもう一度取る
 * - 投げ銭のための取り寄せが居るあいだ、温めは止まって待つ（同じ回線を取り合わない。読みかけの1本も止める）
 */

export const FX_HOLD_BUDGET = 24 * 1024 * 1024;

type Held = { url: string; bytes: number };
/** 元の URL → 手元の URL。ページに1つ */
const held = new Map<string, Held>();
let heldBytes = 0;
/** 手放した回数（上限で止まった温めを、手放したあとにだけ回し直すため） */
let drops = 0;

/** 読みに行っている本（温めと取り寄せで同じ本を二度読まない） */
const inflight = new Map<string, { p: Promise<Blob>; ctl: AbortController | null; warm: boolean }>();
/** 投げ銭のための取り寄せが走っている数。0 でないあいだ、温めは次の本に進まない */
let urgent = 0;
const waiters: (() => void)[] = [];

const canHold = () => typeof URL !== "undefined" && typeof URL.createObjectURL === "function";

/** 手元の URL（持っていなければ null） */
export const fxHeldUrl = (src: string): string | null => held.get(src)?.url ?? null;
/** 持っている本数とバイト数（ログと試験が見る） */
export const fxHoldStats = () => ({ files: held.size, bytes: heldBytes });

function put(src: string, blob: Blob): string {
  const prev = held.get(src);
  if (prev) return prev.url;
  const url = URL.createObjectURL(blob);
  held.set(src, { url, bytes: blob.size });
  heldBytes += blob.size;
  return url;
}

/** 手放す（読めなかった・テーマが替わった）。次の温めで、もう一度取る */
export function dropFxHeld(src: string) {
  const h = held.get(src);
  if (!h) return;
  held.delete(src);
  heldBytes -= h.bytes;
  drops++;
  try {
    URL.revokeObjectURL(h.url);
  } catch {
    // 手放せなくても、数えるのはやめる
  }
}

/** その置き場の本を全部手放す（テーマが替わった・面を閉じた） */
export function dropFxHeldUnder(dir: string) {
  for (const src of [...held.keys()]) if (src.startsWith(`${dir}/`)) dropFxHeld(src);
}

export const fxHoldDrops = () => drops;

/** 取り寄せのための1件ぶん（上限の外で持たなかった本）を手放す */
export function revokeFxUrl(url: string) {
  for (const h of held.values()) if (h.url === url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // 手放せなくても、続ける
  }
}

function grab(src: string, warm: boolean): Promise<Blob> {
  const cur = inflight.get(src);
  if (cur) {
    // 取り寄せが温めの読みかけに乗るなら、その本はもう温めのものではない（止めない）
    if (!warm) cur.warm = false;
    return cur.p;
  }
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const p = (async () => {
    const res = await fetch(src, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.blob();
  })();
  const e = { p, ctl, warm };
  inflight.set(src, e);
  const off = () => {
    if (inflight.get(src) === e) inflight.delete(src);
  };
  p.then(off, off);
  return p;
}

function wakeWarm() {
  while (waiters.length) waiters.shift()!();
}

export type FxHoldResult = {
  /** 新しく持った本数・バイト数 */
  got: number;
  bytes: number;
  /** 読めなかった本数 */
  failed: number;
  /** 上限に届いて止めた */
  full: boolean;
};

/**
 * 温める: 順に1本ずつ持つ（配信しながら落とすので並べない）。上限に届いたら止める。`alive()` が false で止める。
 * 投げ銭のための取り寄せが居るあいだは、次の本に進まずに待つ
 */
export async function holdFxVideos(srcs: readonly string[], alive: () => boolean, budget = FX_HOLD_BUDGET): Promise<FxHoldResult> {
  const out: FxHoldResult = { got: 0, bytes: 0, failed: 0, full: false };
  if (!canHold()) return out;
  for (let i = 0; i < srcs.length; i++) {
    const src = srcs[i];
    if (!alive()) break;
    if (held.has(src)) continue;
    while (urgent > 0 && alive()) await new Promise<void>((r) => waiters.push(r));
    if (!alive()) break;
    if (held.has(src)) continue;
    try {
      const blob = await grab(src, true);
      if (held.has(src)) continue;
      if (heldBytes + blob.size > budget) {
        out.full = true;
        break;
      }
      put(src, blob);
      out.got++;
      out.bytes += blob.size;
    } catch {
      // 取り寄せに譲って止めた本は、同じ本をもう一度（数えない）。ほかのしくじりは、次の温めで試す
      if (urgent > 0) i--;
      else out.failed++;
    }
  }
  return out;
}

export type FxNeed = {
  /** 元の URL → 流す URL（手元の URL）。読めなければ null */
  urls: Map<string, string> | null;
  /** その場で取り寄せた本数と、バイト数 */
  fetched: number;
  bytes: number;
  /** 上限の外で、持たずにこの1件だけに渡した URL（流し終えたら `revokeFxUrl`） */
  transient: string[];
  /** 読めなかった理由（`fetch` = 回線・`hold` = 手元の URL が作れない） */
  why: string | null;
};

/**
 * 投げ銭が来た段の本を、流す URL で返す。持っていればすぐ。持っていなければその場で（並べて）取り寄せ、上限の中なら持つ。
 * 温めの読みかけは、要らない本なら止める（取り寄せが回線を全部使う）
 */
export async function needFxVideos(srcs: readonly string[], budget = FX_HOLD_BUDGET): Promise<FxNeed> {
  const out: FxNeed = { urls: null, fetched: 0, bytes: 0, transient: [], why: null };
  if (!canHold()) return { ...out, why: "hold" };
  const missing = srcs.filter((s) => !held.has(s));
  const extra = new Map<string, string>();
  if (missing.length) {
    urgent++;
    for (const [src, e] of inflight) if (e.warm && !missing.includes(src)) e.ctl?.abort();
    try {
      const blobs = await Promise.all(missing.map((s) => grab(s, false)));
      missing.forEach((s, i) => {
        const b = blobs[i];
        out.fetched++;
        out.bytes += b.size;
        if (held.has(s)) return;
        if (heldBytes + b.size <= budget) put(s, b);
        else {
          const u = URL.createObjectURL(b);
          extra.set(s, u);
          out.transient.push(u);
        }
      });
    } catch {
      return { ...out, why: "fetch" };
    } finally {
      urgent--;
      if (!urgent) wakeWarm();
    }
  }
  const urls = new Map<string, string>();
  for (const s of srcs) {
    const u = held.get(s)?.url ?? extra.get(s);
    if (!u) return { ...out, why: "hold" };
    urls.set(s, u);
  }
  return { ...out, urls };
}

/** 試験だけが使う: 手元を空にする */
export function resetFxHoldForTest() {
  for (const src of [...held.keys()]) dropFxHeld(src);
  inflight.clear();
  urgent = 0;
  waiters.length = 0;
  drops = 0;
}
