"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { useAuth, withRead } from "@/lib/auth";
import { useOnline } from "@/lib/draft";
import Icon from "@/components/ui/Icon";
import { THEMES } from "@/content/themes";
import ReadAgain, { sayable } from "./ReadAgain";

/** 足した貼り先。**焼き込みの表（`content/themes.ts`）と同じ形にそろえる。** */
type Dest = {
  id: string;
  name: string;
  lead: string;
  placeholder: string;
  closed: boolean;
};

/* 口は `/island-api/notes/themes`。**`lib/api.ts` に足していない**——
   あそこは島じゅうが読む1本で、同じ日に何人も触っている。ここだけが
   使う3本なので、使うところに置く。 */
const list = async (): Promise<Dest[]> => {
  const r = await fetch(`${API_BASE}/notes/themes`, { cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).themes ?? [];
};

const save = async (t: Partial<Dest>, token: string) => {
  const r = await fetch(`${API_BASE}/notes/themes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(t),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || String(r.status));
};

const drop = async (id: string, token: string) => {
  const r = await fetch(`${API_BASE}/notes/themes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || String(r.status));
};

/** 鍵（書類ID）。小文字と数字とハイフンだけ。口の `THEME_ID` と同じ決まり。 */
const KEY = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * 付箋ボード。**付箋を貼れる先を、ここから足す・締め切る。**
 *
 * あやと（2026-10-14）「代わりに『付箋ボード（名称は任せる）』と『その他』を追加。
 * 付箋ボードでは、付箋のテーマを追加できたりする」。
 *
 * ## なぜ口から作ったか
 *
 * 貼り先はこれまで焼き込み（`content/themes.ts`）だけだった。足すには
 * Git を出して Hosting を起動し直すことになるので、**配信の最中に
 * 「ここ宛てを集めたい」が出ても、その日のうちには間に合わない。**
 * 入れ物（`islandNoteThemes`）を1つ持って、机から足せるようにする。
 *
 * ## 消さずに締め切る
 *
 * 貼り先を消すと、そこに貼られた付箋が**どこからも読めなくなる**
 * （消えてはいないが、届かない）。だから既定は「締め切る」で、
 * 消せるのは付箋が1枚も無い貼り先だけ（口の側でも数えている）。
 */
export default function NoteThemes() {
  const { token } = useAuth();
  const online = useOnline();
  const [rows, setRows] = useState<Dest[] | null>(null);
  const [read, setRead] = useState<"wait" | "ok" | "down">("wait");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [hint, setHint] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await withRead(list());
      setRows(r);
      setRead("ok");
    } catch {
      setRead("down");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (go: (t: string) => Promise<void>) => {
    setErr(null);
    setState("sending");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      await go(t);
      await load();
      setState("done");
    } catch (e) {
      setState("idle");
      setErr(sayable(e));
    }
  };

  const add = () =>
    run(async (t) => {
      await save({ id: id.trim(), name: name.trim(), lead: lead.trim(), placeholder: hint.trim() }, t);
      setId("");
      setName("");
      setLead("");
      setHint("");
    });

  /** 焼き込みの鍵。**同じ鍵を足させない**（足すと、どちらが出るか決まらない） */
  const baked = new Set(THEMES.map((t) => t.id));
  const dup = baked.has(id.trim()) || (rows ?? []).some((r) => r.id === id.trim());
  const ready = KEY.test(id.trim()) && name.trim().length >= 2 && !dup;

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。
        </p>
      )}

      <p className="mp-now">
        貼り先は <b>{read === "ok" ? baked.size + (rows?.length ?? 0) : "…"}</b> 件
      </p>

      {read === "down" && <ReadAgain what="貼り先" onRetry={load} />}

      {/* 足したぶん。締め切る・開ける・消すができるのはこちらだけ。
          焼き込みのぶんは Git からしか動かないので、ここには出さない。 */}
      {read === "ok" && (rows?.length ?? 0) > 0 && (
        <ul className="nt-dests">
          {rows!.map((r) => (
            <li key={r.id} className="nt-dest">
              <span className="nt-dest-t">
                <b>{r.name}</b>
                <i>{r.lead}</i>
              </span>
              <span className="nt-dest-go">
                <button
                  type="button"
                  className="trip-week-x"
                  disabled={state === "sending"}
                  onClick={() => run((t) => save({ ...r, closed: !r.closed }, t))}
                >
                  {r.closed ? "また貼れるようにする" : "締め切る"}
                </button>
                <button
                  type="button"
                  className="trip-week-x"
                  disabled={state === "sending"}
                  onClick={() => run((t) => drop(r.id, t))}
                >
                  消す
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 足す。**鍵（書類ID）も打たせる。** 島の道（`/board` の札）と
          焼き込みの表が同じ鍵で結ばれているので、こちらで作る必要がある。 */}
      <label className="nph-post-row">
        <span>名前</span>
        <input
          type="text"
          value={name}
          maxLength={24}
          placeholder="北マケドニアでこれやって"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="nph-post-row">
        <span>鍵</span>
        <input
          type="text"
          value={id}
          maxLength={40}
          placeholder="north-macedonia"
          onChange={(e) => setId(e.target.value.toLowerCase())}
        />
      </label>
      <label className="nph-post-row">
        <span>一行</span>
        <input
          type="text"
          value={lead}
          maxLength={80}
          placeholder="北マケドニアでやってほしいこと。"
          onChange={(e) => setLead(e.target.value)}
        />
      </label>
      <label className="nph-post-row">
        <span>書く見本</span>
        <input
          type="text"
          value={hint}
          maxLength={80}
          placeholder="例）オフリド湖のそばの古い教会を、朝いちばんに見てほしい"
          onChange={(e) => setHint(e.target.value)}
        />
      </label>

      <div className="trip-send">
        <button className="mp-send" disabled={!ready || state === "sending"} onClick={add}>
          {state === "sending" ? "送っています…" : "この貼り先をつくる"}
        </button>
        {dup && !!id.trim() && (
          <p className="err">
            <Icon name="alert" size={13} /> その鍵は、もう使われています。
          </p>
        )}
        {state === "done" && !err && (
          <p className="nph-ok">
            <Icon name="check" size={13} /> 島じゅうに出ました。
          </p>
        )}
        {err && (
          <p className="err">
            <Icon name="alert" size={13} /> 送れませんでした。{err}
          </p>
        )}
      </div>
    </div>
  );
}
