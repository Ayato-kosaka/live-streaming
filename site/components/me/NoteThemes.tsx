"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import { useAuth, withRead } from "@/lib/auth";
import { useOnline } from "@/lib/draft";
import {
  bakedDest,
  isBaked,
  loadDests,
  mergeDests,
  type AddedDest,
} from "@/lib/dests";
import Icon from "@/components/ui/Icon";
import { shelves, type Theme } from "@/content/themes";
import ReadAgain, { sayable } from "./ReadAgain";

/* 口は `/island-api/notes/themes`。**`lib/api.ts` に足していない**——
   あそこは島じゅうが読む1本で、同じ日に何人も触っている。読むほうは
   `lib/dests.ts` が持っているので、ここに置くのは**書く2本だけ。** */

const save = async (t: Partial<AddedDest>, token: string) => {
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
  if (!r.ok) {
    const e: Error & { status?: number } = new Error(
      (await r.json().catch(() => ({}))).error || String(r.status),
    );
    e.status = r.status;
    throw e;
  }
};

/** 鍵（書類ID）。小文字と数字とハイフンだけ。口の `THEME_ID` と同じ決まり。 */
const KEY = /^[a-z][a-z0-9-]{1,39}$/;

/** 直している途中の字。保存を押すまで送らない。 */
type Draft = { name: string; lead: string; placeholder: string };

/**
 * 付箋ボード。**付箋を貼れる先を、ここから手入れする。**
 *
 * あやと（2026-10-14）「代わりに『付箋ボード（名称は任せる）』と『その他』を追加。
 * 付箋ボードでは、付箋のテーマを追加できたりする」。
 * あやと（2026-10-15）「島の手入れでは既存の貼り先の手入れもしたい」。
 *
 * ## なぜ口から作ったか
 *
 * 貼り先はこれまで焼き込み（`content/themes.ts`）だけだった。足すには
 * Git を出して Hosting を起動し直すことになるので、**配信の最中に
 * 「ここ宛てを集めたい」が出ても、その日のうちには間に合わない。**
 * 入れ物（`islandNoteThemes`）を1つ持って、机から足せるようにする。
 *
 * ## 足すだけでは足りなかった（2026-10-15）
 *
 * 2026-10-14 に入ったのは**足す・締め切る・消す**の3つだけで、
 * もとから在る19件はこの画面に1行も出ていなかった。**あやとが開くと
 * 「何も無い」ように見える。** 口（`POST`）はもともと upsert なので、
 * 直す仕掛けは在った——**出していなかっただけ。**
 *
 * いまは焼き込みと足したぶんを重ねて（`lib/dests.ts`）、**在る貼り先を
 * 全部並べる。** 島の側も同じ1本を読む（`components/live/Notes.tsx`）。
 *
 * ## 消さずに締め切る
 *
 * 貼り先を消すと、そこに貼られた付箋が**どこからも読めなくなる**
 * （消えてはいないが、届かない）。だから既定は「締め切る」で、
 * 消せるのは付箋が1枚も無い貼り先だけ（口の側でも数えている）。
 *
 * もとから在る行は**消せない。** 「もとの字にもどす」は、机で上書きした
 * ぶんを取り下げるだけなので、付箋が貼ってあっても迷子にならない
 * （口が 409 を返したら、**焼き込みと同じ字を書き戻して**着地させる）。
 */
export default function NoteThemes() {
  const { token } = useAuth();
  const online = useOnline();
  const [added, setAdded] = useState<AddedDest[] | null>(null);
  const [read, setRead] = useState<"wait" | "ok" | "down">("wait");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [hint, setHint] = useState("");
  const [state, setState] = useState<"idle" | "sending">("idle");
  /** 直前の返事を、**押した場所のそばに**出す。`at` は行の鍵か、足す欄の `new` */
  const [said, setSaid] = useState<{ at: string; ok?: string; err?: string } | null>(null);
  /** いま直している行。1つずつしか開かない（欄が何組も同時に生きると取り違える） */
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", lead: "", placeholder: "" });

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await withRead(loadDests(fresh));
      setAdded(r);
      setRead("ok");
    } catch {
      setRead("down");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 在る貼り先ぜんぶ（焼き込み ＋ 足したぶん）。 */
  const all = useMemo(() => mergeDests(added), [added]);
  /** 見出しごとの束。並びは `content/themes.ts` の表が決める。 */
  const groups = useMemo(() => shelves(all, new Date()), [all]);
  /** 机から直してあるか。もとから在る行でも、直してあれば戻せる。 */
  const touched = useMemo(() => new Set((added ?? []).map((a) => a.id)), [added]);

  const run = async (at: string, go: (t: string) => Promise<void>, done: string) => {
    setSaid(null);
    setState("sending");
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      await go(t);
      await load(true);
      setState("idle");
      setSaid({ at, ok: done });
    } catch (e) {
      setState("idle");
      setSaid({ at, err: sayable(e) });
    }
  };

  /** 押した場所に出す1行。**何も起きていないときは何も出さない。** */
  const Say = ({ at }: { at: string }) =>
    said?.at !== at ? null : said.err !== undefined ? (
      <p className="err">
        <Icon name="alert" size={13} /> 送れませんでした。{said.err}
      </p>
    ) : (
      <p className="nph-ok">
        <Icon name="check" size={13} /> {said.ok}
      </p>
    );

  const add = () =>
    run("new", async (t) => {
      await save(
        { id: id.trim(), name: name.trim(), lead: lead.trim(), placeholder: hint.trim() },
        t,
      );
      setId("");
      setName("");
      setLead("");
      setHint("");
    }, "つくりました。");

  /** 直した字を送る。**締め切りの状態はそのまま持っていく**（別の押しどころの仕事） */
  const keep = (t: Theme) =>
    run(t.id, async (tok) => {
      await save(
        {
          id: t.id,
          name: draft.name.trim(),
          lead: draft.lead.trim(),
          placeholder: draft.placeholder.trim(),
          closed: !!t.closed,
        },
        tok,
      );
      setEdit(null);
    }, "なおしました。");

  /** 締め切る／また貼れるようにする。**いまの字をそのまま送り直す**（口は丸ごと受ける） */
  const shut = (t: Theme, closed: boolean) =>
    run(
      t.id,
      (tok) =>
        save(
          { id: t.id, name: t.name, lead: t.lead, placeholder: t.placeholder, closed },
          tok,
        ),
      closed ? "締め切りました。" : "また貼れるようにしました。",
    );

  /**
   * もとから在る行を、焼き込みの字に戻す。
   *
   * **付箋が1枚でも貼ってあると、口は消させてくれない**（409）。
   * それは正しい守りなので、こちらは**焼き込みと同じ字を書き戻して**着地する。
   * 行そのものは焼き込みに在るので、付箋は迷子にならない。
   * **409 は画面に出さない**——読む人には何も起きていないのと同じこと。
   */
  const revert = (t: Theme) =>
    run(t.id, async (tok) => {
      const b = bakedDest(t.id);
      try {
        await drop(t.id, tok);
      } catch (e) {
        if ((e as { status?: number }).status !== 409 || !b) throw e;
        await save(
          {
            id: b.id,
            name: b.name,
            lead: b.lead,
            placeholder: b.placeholder,
            closed: !!b.closed,
          },
          tok,
        );
      }
      setEdit(null);
    }, "もとの字にもどしました。");

  /** 足したぶんを消す。付箋が貼ってあれば口が止めるので、その字を出す。 */
  const remove = (t: Theme) => run(t.id, (tok) => drop(t.id, tok), "消しました。");

  const dup = all.some((t) => t.id === id.trim());
  const ready =
    read === "ok" && KEY.test(id.trim()) && name.trim().length >= 2 && !dup;

  const open = (t: Theme) => {
    setSaid(null);
    setEdit(t.id);
    setDraft({ name: t.name, lead: t.lead, placeholder: t.placeholder });
  };

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。
        </p>
      )}

      <p className="mp-now">
        貼り先は <b>{read === "ok" ? all.length : "…"}</b> 件
      </p>

      {read === "down" && <ReadAgain what="貼り先" onRetry={() => load(true)} />}

      {/* 在る貼り先ぜんぶ。見出しごとにまとめる（並びは島の表が決める）。

          **1行ずつ畳む**（`docs/island-standards.md` 7章）。19件を開いたまま
          縦に積むと、390px で 5,200px——スマホ6画面ぶんになる。畳みは島の紙と
          同じ形（`.folds` / `.fold`）にそろえる。**開いた行が、直す行。** */}
      {read === "ok" &&
        groups.map((g) => (
          <section key={g.group} className="nd-group">
            <h4 className="nd-glabel">{g.group}</h4>
            <div className="folds">
              {g.themes.map((t) => (
                <details
                  key={t.id}
                  className={`fold nd-row${t.closed ? " is-shut" : ""}`}
                  open={edit === t.id}
                  onToggle={(e) => {
                    const o = e.currentTarget.open;
                    if (o && edit !== t.id) open(t);
                    if (!o && edit === t.id) setEdit(null);
                  }}
                >
                  <summary>
                    <span className="fold-t">
                      <b>{t.name}</b>
                      <i>{t.lead}</i>
                    </span>
                    {/* いま貼れない先は、開かなくても分かるようにする */}
                    {t.closed && <em className="nd-shut">いまは貼れません</em>}
                    <Icon name="chevron" size={20} className="fold-c" />
                  </summary>
                  <div className="fold-body nd-body">
                    <label className="nph-post-row">
                      <span>名前</span>
                      <input
                        type="text"
                        value={draft.name}
                        maxLength={24}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </label>
                    <label className="nph-post-row">
                      <span>一行</span>
                      <input
                        type="text"
                        value={draft.lead}
                        maxLength={80}
                        onChange={(e) => setDraft({ ...draft, lead: e.target.value })}
                      />
                    </label>
                    <label className="nph-post-row">
                      <span>書く見本</span>
                      <input
                        type="text"
                        value={draft.placeholder}
                        maxLength={80}
                        onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })}
                      />
                    </label>
                    <span className="nd-go">
                      <button
                        type="button"
                        className="nd-keep"
                        disabled={state === "sending" || draft.name.trim().length < 2}
                        onClick={() => keep(t)}
                      >
                        保存する
                      </button>
                      <button
                        type="button"
                        className="trip-week-x"
                        disabled={state === "sending"}
                        onClick={() => shut(t, !t.closed)}
                      >
                        {t.closed ? "また貼れるようにする" : "締め切る"}
                      </button>
                      {/* もとから在る行は消せない。机で直したぶんだけ取り下げる。 */}
                      {isBaked(t.id) && touched.has(t.id) && (
                        <button
                          type="button"
                          className="trip-week-x"
                          disabled={state === "sending"}
                          onClick={() => revert(t)}
                        >
                          もとの字にもどす
                        </button>
                      )}
                      {!isBaked(t.id) && (
                        <button
                          type="button"
                          className="trip-week-x"
                          disabled={state === "sending"}
                          onClick={() => remove(t)}
                        >
                          消す
                        </button>
                      )}
                    </span>
                    <Say at={t.id} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

      {/* 足す。**鍵（書類ID）も打たせる。** 島の道（`/board` の札）と
          焼き込みの表が同じ鍵で結ばれているので、こちらで作る必要がある。

          **見本に、もう在る貼り先を書かない。** 「北マケドニアでこれやって」は
          上の一覧に並んでいる行なので、見本のまま打つと「その鍵は、もう
          使われています」で止まる。見本は、これから作りそうなものにする。 */}
      <h4 className="nd-glabel nd-addl">貼り先をふやす</h4>
      <label className="nph-post-row">
        <span>名前</span>
        <input
          type="text"
          value={name}
          maxLength={24}
          placeholder="オフリド湖でこれやって"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="nph-post-row">
        <span>鍵</span>
        <input
          type="text"
          value={id}
          maxLength={40}
          placeholder="ohrid-lake"
          onChange={(e) => setId(e.target.value.toLowerCase())}
        />
      </label>
      <label className="nph-post-row">
        <span>一行</span>
        <input
          type="text"
          value={lead}
          maxLength={80}
          placeholder="オフリド湖のまわりでやってほしいこと。"
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

      <div className="nd-send">
        <button className="mp-send" disabled={!ready || state === "sending"} onClick={add}>
          {state === "sending" ? "送っています…" : "この貼り先をつくる"}
        </button>
        {dup && !!id.trim() && (
          <p className="err">
            <Icon name="alert" size={13} /> その鍵は、もう使われています。
          </p>
        )}
        <Say at="new" />
      </div>
    </div>
  );
}
