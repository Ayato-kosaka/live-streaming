"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, withRead, type Read } from "@/lib/auth";
import {
  answerCalib,
  decideImport,
  getImport,
  type ImportItem,
  type ImportList,
} from "@/lib/cardImport";

/**
 * 取り込みの候補を読んで、外す／戻すを裏で送る束（`/cards/import`）。
 *
 * ## 押した瞬間に見た目を変え、送るのはまとめて
 *
 * 数百枚を1枚ずつ外していくので、1回押すたびに返事を待つと指が止まる。
 * 手元の状態を先に変えて、送るのは 0.6 秒押されなかったときに1本へまとめる。
 * 送れなかったぶんは持ったまま、間隔を倍にしながら黙って送り直す。
 *
 * **送れていないまま登録へ進めない**（`flush`）。外したはずの写真が
 * カードになって配られるのが、ここでいちばん起きてはいけないこと。
 */

/** 一覧に並ぶ（外す／戻すができる）もの */
export const SHOWN = new Set(["candidate", "excluded", "failed", "registering"]);
/** 登録予定に数えるもの */
export const KEEP = new Set(["candidate", "failed", "registering"]);

export type Sync = "ok" | "sending" | "down";

export function useImport() {
  const { token } = useAuth();
  const [list, setList] = useState<ImportList | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [again, setAgain] = useState(0);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  /** 送っていない「外す／戻す」。sha → 外すか */
  const pend = useRef(new Map<string, boolean>());
  /** 送っていない認識合わせの答え */
  const pendCalib = useRef(new Map<string, "yes" | "no">());
  const [sync, setSync] = useState<Sync>("ok");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const miss = useRef(0);
  const flying = useRef<Promise<boolean> | null>(null);

  /* ---------- 読む ---------- */
  useEffect(() => {
    let gone = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const go = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const batch =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("batch") ?? undefined
            : undefined;
        const got = await withRead(getImport(t, batch), 30000);
        if (gone) return;
        /* 送っていない手元の判断は、読み直しても消さない */
        const items = got.items.map((i) => {
          const ex = pend.current.get(i.sha);
          const ans = pendCalib.current.get(i.sha);
          let x = i;
          if (ex !== undefined && (i.status === "candidate" || i.status === "excluded"))
            x = { ...x, status: ex ? "excluded" : "candidate" };
          if (ans) x = { ...x, calibAnswer: ans };
          return x;
        });
        setList({ ...got, items });
        setRead("ok");
      } catch {
        if (gone) return;
        setRead((r) => (r === "ok" ? "ok" : "down"));
        n += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (n - 1), 30000));
      }
    };
    go();
    return () => {
      gone = true;
      clearTimeout(wait);
    };
  }, [token, again]);

  /* ---------- 送る ---------- */
  /** 送る本体。待ちの札（`schedule`）と互いに呼ぶので、札からは ref で引く */
  const sendRef = useRef<() => Promise<boolean>>(async () => true);
  const schedule = useCallback((ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void sendRef.current(), ms);
  }, []);

  const send = useCallback(async (): Promise<boolean> => {
    if (flying.current) await flying.current;
    if (!pend.current.size && !pendCalib.current.size) {
      setSync("ok");
      return true;
    }
    const out = new Map(pend.current);
    const ans = new Map(pendCalib.current);
    const p = (async () => {
      setSync("sending");
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const ex = [...out].filter(([, v]) => v).map(([k]) => k);
        const back = [...out].filter(([, v]) => !v).map(([k]) => k);
        if (ex.length) await withRead(decideImport(t, ex, true), 30000);
        if (back.length) await withRead(decideImport(t, back, false), 30000);
        if (ans.size)
          await withRead(
            answerCalib(t, [...ans].map(([sha, answer]) => ({ sha, answer }))),
            30000,
          );
        /* 送っているあいだに押し直されたものは残す */
        for (const [k, v] of out) if (pend.current.get(k) === v) pend.current.delete(k);
        for (const [k, v] of ans) if (pendCalib.current.get(k) === v) pendCalib.current.delete(k);
        miss.current = 0;
        const more = pend.current.size + pendCalib.current.size > 0;
        setSync(more ? "sending" : "ok");
        if (more) schedule(600);
        return true;
      } catch {
        miss.current += 1;
        setSync("down");
        schedule(Math.min(2000 * 2 ** (miss.current - 1), 30000));
        return false;
      }
    })();
    flying.current = p;
    const ok = await p;
    if (flying.current === p) flying.current = null;
    return ok;
  }, [token, schedule]);
  sendRef.current = send;

  useEffect(() => () => clearTimeout(timer.current), []);

  /* 送っていないものがあるまま閉じようとしたら止める */
  useEffect(() => {
    const stop = (e: BeforeUnloadEvent) => {
      if (pend.current.size || pendCalib.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", stop);
    const wake = () => {
      if (pend.current.size || pendCalib.current.size) void send();
    };
    window.addEventListener("online", wake);
    return () => {
      window.removeEventListener("beforeunload", stop);
      window.removeEventListener("online", wake);
    };
  }, [send]);

  /** 外す（true）／戻す（false）。見た目はその場で変わる */
  const decide = useCallback(
    (shas: string[], exclude: boolean) => {
      if (!shas.length) return;
      const want = new Set(shas);
      setList((l) =>
        l && {
          ...l,
          items: l.items.map((i) =>
            want.has(i.sha) && (i.status === "candidate" || i.status === "excluded" || i.status === "failed")
              ? { ...i, status: exclude ? "excluded" : "candidate" }
              : i,
          ),
        },
      );
      for (const s of shas) pend.current.set(s, exclude);
      setSync("sending");
      schedule(600);
    },
    [schedule],
  );

  /** 認識合わせの答え */
  const answer = useCallback(
    (sha: string, a: "yes" | "no") => {
      setList((l) => l && { ...l, items: l.items.map((i) => (i.sha === sha ? { ...i, calibAnswer: a } : i)) });
      pendCalib.current.set(sha, a);
      setSync("sending");
      schedule(400);
    },
    [schedule],
  );

  /** 登録の結果を手元へ写す（読み直しを待たずに一覧から外す） */
  const mark = useCallback((res: { sha: string; status: ImportItem["status"]; error?: string }[]) => {
    if (!res.length) return;
    const by = new Map(res.map((r) => [r.sha, r]));
    setList(
      (l) =>
        l && {
          ...l,
          items: l.items.map((i) => {
            const r = by.get(i.sha);
            return r ? { ...i, status: r.status, error: r.error ?? i.error } : i;
          }),
        },
    );
  }, []);

  /** 送っていないものを、いま送り切る。送れなければ false */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    return send();
  }, [send]);

  const items = useMemo(() => list?.items ?? [], [list]);
  return { list, items, read, reload, decide, answer, mark, flush, sync };
}

/** 日ごとに束ねる。古い日から（旅の順に見返す） */
export function byDay(items: ImportItem[]): { day: string; items: ImportItem[] }[] {
  const at = new Map<string, ImportItem[]>();
  for (const i of items) {
    const d = at.get(i.day) ?? [];
    d.push(i);
    at.set(i.day, d);
  }
  return [...at.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({
      day,
      items: list.sort((a, b) =>
        (a.takenAt ?? "") < (b.takenAt ?? "") ? -1 : (a.takenAt ?? "") > (b.takenAt ?? "") ? 1 : a.sha < b.sha ? -1 : 1,
      ),
    }));
}
