"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { withRead } from "@/lib/auth";
import { loadState, reloadState } from "@/lib/liveStats";
import { tipLimitsOf, type TipLimits } from "./yen";

/**
 * 投げ銭の幅を `GET /state` から受ける。**往復は増えない**（島じゅうで1回だけ引く `/state` を借りる）。
 *
 * - `wait` … まだ届いていない（形だけの板を出す）
 * - `down` … 読めなかった（「もう一度よみこむ」を出す。**0円や既定の幅に倒さない**。`docs/island-standards.md` §10）
 * - `off`  … 読めたが、投げ銭の幅が入っていない（投げ銭の口がまだ無い。お休みの1枚を出す）
 * - `ok`   … 幅がそろった
 */
export type LimitsRead = { st: "wait" } | { st: "down" } | { st: "off" } | { st: "ok"; lim: TipLimits };

export function useTipLimits(): [LimitsRead, () => void] {
  const [got, setGot] = useState<LimitsRead>({ st: "wait" });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    (again ? reloadState() : loadState()).then((s) => {
      if (!alive) return;
      if (!s) return setGot({ st: "down" });
      const lim = tipLimitsOf(s.limits);
      setGot(lim ? { st: "ok", lim } : { st: "off" });
    });
    return () => {
      alive = false;
    };
  }, [again]);
  const retry = useCallback(() => {
    setGot({ st: "wait" });
    setAgain((n) => n + 1);
  }, []);
  return [got, retry];
}

/**
 * 支払いの画面を作ってもらった結果。**断られた理由は、画面が次に何を出すかで分ける**
 * （`docs/island-standards.md` 26.5。人が直せる話と、こちらが直す話を同じ字にしない）。
 *
 * | 返事 | 中身 | 画面 |
 * | --- | --- | --- |
 * | 401 | 入っていない・合言葉が切れた | 入りなおす |
 * | 403 `channel required` | チャンネルを結んでいない | チャンネルで入りなおす |
 * | 400 `ng word` | メッセージに使えない言葉が入っている（どの語かは言わない） | 入力にもどって、メッセージを直す |
 * | 400 | 額か字数が幅の外 | 入力にもどる |
 * | 429 | 今日はもう作れない（1人1日の栓） | また明日 |
 * | 503 `tip not configured` | 受け取る準備が無い | お休み |
 * | それ以外・返事が無い | つながらなかった | もう一度 |
 */
export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; why: "signin" | "channel" | "ngword" | "range" | "today" | "closed" | "down" };

/** 移る先は https だけ。口の返事でも、確かめずに `location` へ渡さない（`docs/island-standards.md` 29.3） */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export async function postTipCheckout(yen: number, message: string, token: string): Promise<CheckoutResult> {
  let res: Response;
  try {
    res = await withRead(
      fetch(`${API_BASE}/tip/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        /* **送るのは額とメッセージの2つだけ。** 名前もチャンネルも送らない——口が本人の書類から引く
           （`docs/island-api.md` 13章「名前は送らせない」） */
        body: JSON.stringify({ yen, message }),
      }),
    );
  } catch {
    return { ok: false, why: "down" };
  }
  if (res.status === 401) return { ok: false, why: "signin" };
  if (res.status === 403) return { ok: false, why: "channel" };
  if (res.status === 400) {
    const e: unknown = await res.json().catch(() => null);
    return { ok: false, why: (e as { error?: unknown } | null)?.error === "ng word" ? "ngword" : "range" };
  }
  if (res.status === 429) return { ok: false, why: "today" };
  if (res.status === 503) return { ok: false, why: "closed" };
  if (!res.ok) return { ok: false, why: "down" };
  const body: unknown = await res.json().catch(() => null);
  const url = httpsUrl((body as { url?: unknown } | null)?.url);
  return url ? { ok: true, url } : { ok: false, why: "down" };
}

/**
 * 打ちかけの額とメッセージ。**支払いの画面から戻ってきたとき**（やめた・戻るを押した）に、打ち直させないため。
 * この端末のこのタブだけの控え（sessionStorage）。置けない端末では、打ち直すだけ。
 */
const DRAFT = "ayato-island-tip-draft";

export type Draft = { yen: string; message: string };

export function readDraft(): Draft | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRAFT) || "null");
    return v && typeof v.yen === "string" && typeof v.message === "string" ? { yen: v.yen, message: v.message } : null;
  } catch {
    return null;
  }
}

export function keepDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT);
  } catch {
    /* 置けない端末では、戻ってきたときに打ち直すだけ */
  }
}
