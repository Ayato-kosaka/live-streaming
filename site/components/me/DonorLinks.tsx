"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dropDonor,
  getDonors,
  linkDonor,
  unlinkDonor,
  type Donor,
  type DonorState,
  type DonorVia,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";

/**
 * 投げ銭を、YouTube につなぐ。**あやとだけ。**
 *
 * ## なぜ画面が要るのか
 *
 * Doneru は YouTube のチャンネルIDを持っていない。持っているのは
 * どねID（`viewer_pk`）と、Doneru に出ていた呼び名だけ。あやと島カードは
 * YouTube のアカウントに配るので、ここを結ばないと、投げ銭してくれた人に
 * 何も渡らない。
 *
 * 結ぶ手立てが「Git の JSON に1行足して、ワークフローを手で流す」しか
 * 無かった。**9月11日から北欧に出る。スマホしかない場所で、それはできない。**
 *
 * ## 打ったら、その場で決まる
 *
 * 名前からチャンネルIDを引くのはサーバー側（`functions/src/donors.ts`）。
 * 島の名簿（`islandChannels`）を引いて、無ければ YouTube に聞く。
 * **「あとで引く」状態は作らない。** 打った直後に、何に繋がったかが出る。
 *
 * 決まらないのは2つだけで、どちらもそう言う。
 * 名前が2人に使われているとき（表示名は誰でも同じにできる）と、
 * どこにも見つからないとき。
 *
 * ## 確認を挟まない
 *
 * 打ち直しも「本当にいいですか」も置かない（あやとの言葉「間違えないので
 * ご安心を」）。押したら入る。間違えたら、もう一度打てば上書きされる。
 *
 * ## 「この人は分からない」は、対等な選択肢
 *
 * 消すのとは違う。**分からないと決めたことも1つの答え**で、表に残さないと
 * 翌朝また「新規」として赤くなる。禁止の赤い印は置かない
 * （`components/cards/CardSheet.tsx` の「入れない」と同じ扱い）。
 */

/** 状態の呼び名。**画面には英語を出さない。** */
const STATE_NAME: Record<DonorState, string> = {
  new: "紐付け待ち",
  unlinked: "分からない",
  linked: "つないである",
};

/** 何で引けたか。押した人が、どこ経由で繋がったのかを確かめられるように。 */
const VIA_NAME: Record<DonorVia, string> = {
  id: "チャンネルIDそのもの",
  dict: "島の名簿",
  youtube: "YouTube に聞いた",
};

/** 「2026-09-06T…」→「9月6日」。島の中の日付はいつもこの形。 */
const day = (iso: string) =>
  `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

/**
 * つながったときの1行。**何に繋がったかまで言う。**
 *
 * 打った字と、繋がった先の名前が同じときは、片方だけ。
 * 「@ひめひめ-r9z → @ひめひめ-r9z につながりました」は、読んで何も増えない。
 */
function saidOk(typed: string, d: Donor, via: DonorVia | null): string {
  const name = d.channelName ?? d.channelId ?? typed;
  const to = name === typed ? typed : `${typed} → ${name}`;
  return `${to} につながりました（${VIA_NAME[via ?? "dict"]}）`;
}

/**
 * 画面に並んでいる1行。
 *
 * `slot` は**開いたときの状態**で、押しても変わらない。ここを live の
 * `donor.state` にすると、つないだ瞬間にその行が「紐付け待ち」から消えて、
 * 畳んである「つないである人」の中へ飛ぶ。**押した結果の1行も一緒に
 * 消える**ので、押した人には「入ったのかどうか」が分からない。
 * 並びが直るのは、次に開いたとき。
 */
type Slot = { slot: DonorState; donor: Donor };

export default function DonorLinks() {
  const { token } = useAuth();
  /** 取りにいっている最中は null。0件と区別する */
  const [rows, setRows] = useState<Slot[] | null>(null);
  const [down, setDown] = useState(false);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) return;
    setRows(null);
    setDown(false);
    try {
      const r = await getDonors(t);
      setRows(r.donors.map((d) => ({ slot: d.state, donor: d })));
    } catch {
      setRows([]);
      setDown(true);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = (next: Donor) =>
    setRows((cur) => {
      if (!cur) return cur;
      const had = cur.some((x) => x.donor.viewerPk === next.viewerPk);
      return had
        ? cur.map((x) =>
            x.donor.viewerPk === next.viewerPk ? { ...x, donor: next } : x,
          )
        : [...cur, { slot: next.state, donor: next }];
    });

  const dropped = (pk: string) =>
    setRows((cur) => cur?.filter((x) => x.donor.viewerPk !== pk) ?? cur);

  const waiting = (rows ?? []).filter((x) => x.slot === "new");
  const unknown = (rows ?? []).filter((x) => x.slot === "unlinked");
  const linked = (rows ?? []).filter((x) => x.slot === "linked");
  /** いま何人つながっているか。**押すたびに動く**ので、live の state で数える */
  const live = (rows ?? []).map((x) => x.donor.state);

  return (
    <section className="panel paper">
      <h2>投げ銭を、YouTube につなぐ</h2>
      <p className="muted">
        {"Doneru はチャンネルを持っていません。ここで結ぶと、" +
          "翌朝からその人にもカードが届きます。"}
      </p>

      {rows === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : rows.length === 0 ? (
        <div className="blank">
          <b>まだ1人も入っていません</b>
          <p>
            投げ銭が届くと、翌朝の取り込みがここに並べます。先に分かっている人が
            いれば、下から入れておけます。
          </p>
        </div>
      ) : (
        <>
          <p className="mp-donor-count">
            紐付け待ち <b>{live.filter((v) => v === "new").length}</b>人 /
            分からない <b>{live.filter((v) => v === "unlinked").length}</b>人 /
            つないである <b>{live.filter((v) => v === "linked").length}</b>人
          </p>

          {/* **赤くなっている原因がいちばん上。** 毎朝の取り込みは、ここに
              1人でも残っているあいだ落ち続ける（`doneru_supporters.py`）。 */}
          <Group
            title="紐付け待ち"
            lead="ここが空になると、毎朝の取り込みが緑に戻る"
            rows={waiting}
            onChanged={changed}
            onDropped={dropped}
          />
          {/* **分からない人は、開いて並べない。** あやとの言葉（2026-09-09）
              「わからないと決めた人を毎回出すのはやめてほしい。ドネルは名前を
              自由に打てるので、それで適当な名前を打たれるとこっちからすると
              わからないのでわからないものはわからないです」。

              一度「分からない」と決めた人は、**もう一度見ても分からない。**
              毎朝そこに6人並んでいると、上の「紐付け待ち」——本当に手を
              動かすところ——が下へ押される。

              消しはしない。あとから分かることはある（配信で本人が名乗る、
              同じ名前でスパチャが続く）ので、畳みの中には残す。 */}
          {unknown.length > 0 && (
            <Fold title="分からないと決めた人" lead={`${unknown.length}人`}>
              <p className="muted mp-small">
                分かったら、ここで打てます。ふだんは開かなくて大丈夫です。
              </p>
              <ul className="mp-care">
                {unknown.map((x) => (
                  <Row
                    key={x.donor.viewerPk}
                    donor={x.donor}
                    onChanged={changed}
                    onDropped={dropped}
                  />
                ))}
              </ul>
            </Fold>
          )}
          {/* つないである人は、ふだん触らない。畳んで下に置く。 */}
          {linked.length > 0 && (
            <Fold title="つないである人" lead={`${linked.length}人`}>
              <Longer items={linked} first={5} step={10} unit="人" className="mp-care">
                {(x) => (
                  <Row
                    key={x.donor.viewerPk}
                    donor={x.donor}
                    onChanged={changed}
                    onDropped={dropped}
                  />
                )}
              </Longer>
            </Fold>
          )}
        </>
      )}

      <NewRow onChanged={changed} />

      {down && (
        <p className="muted mp-small">
          いま読めませんでした。電波の届くところで開き直すと出ます。
        </p>
      )}
    </section>
  );
}

/** ひとまとまり。0人のときは、見出しごと出さない（空の見出しを並べない）。 */
function Group({
  title,
  lead,
  rows,
  onChanged,
  onDropped,
}: {
  title: string;
  lead: string;
  rows: Slot[];
  onChanged: (d: Donor) => void;
  onDropped: (pk: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mp-donor-group">
      <p className="mp-donor-h">
        <b>{title}</b>
        <i>{lead}</i>
      </p>
      {/* 1人ぶんが「名前・いまの状態・書く欄2つ・押しどころ」の4段。
          **新しい人は毎晩入る**ので、はじめは5人だけ出す（#225）。
          上から順に片づける道具なので、6人目が見えている必要はない。 */}
      <Longer items={rows} first={5} step={10} unit="人" className="mp-care">
        {(x) => (
          <Row
            key={x.donor.viewerPk}
            donor={x.donor}
            onChanged={onChanged}
            onDropped={onDropped}
          />
        )}
      </Longer>
    </div>
  );
}

/**
 * 1人ぶん。
 *
 * どねID は書類の id なので直せない（打ち間違えたら、消して入れ直す）。
 * 直せるのは名前のほうだけなので、**どねID の欄は読むだけの欄**にして、
 * 書ける欄と見た目を分ける。
 */
function Row({
  donor,
  onChanged,
  onDropped,
}: {
  donor: Donor;
  onChanged: (d: Donor) => void;
  onDropped: (pk: string) => void;
}) {
  const { token } = useAuth();
  const [typed, setTyped] = useState(donor.handle ?? "");
  const [busy, setBusy] = useState(false);
  /** 押した結果。**その場で見えないと、入ったのかどうか分からない** */
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  const link = async () => {
    const t = await token();
    if (!t) return;
    const v = typed.trim();
    if (!v) {
      setBad(true);
      setSaid("名前を打ってから押してください。");
      return;
    }
    setBusy(true);
    setSaid(null);
    const r = await linkDonor(donor.viewerPk, v, t);
    setBusy(false);
    setBad(!r.ok);
    if (r.ok) {
      onChanged(r.donor);
      setSaid(saidOk(v, r.donor, r.via));
    } else if (r.why === "duplicate") {
      setSaid(`${v} は2人に使われています。チャンネルID（UC…）を貼ってください。`);
    } else if (r.why === "notfound") {
      setSaid(`${v} は見つかりませんでした。打ち直すか、分からないにしてください。`);
    } else {
      setSaid("いま送れませんでした。もう一度押してください。");
    }
  };

  const unknown = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setSaid(null);
    const r = await unlinkDonor(donor.viewerPk, t);
    setBusy(false);
    setBad(!r.ok);
    if (r.ok) {
      onChanged(r.donor);
      setTyped("");
      setSaid("分からない、にしました。翌朝また赤くなることはありません。");
    } else {
      setSaid("いま送れませんでした。もう一度押してください。");
    }
  };

  const drop = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setSaid(null);
    try {
      await dropDonor(donor.viewerPk, t);
      onDropped(donor.viewerPk);
    } catch {
      setBad(true);
      setSaid("いま消せませんでした。もう一度押してください。");
      setBusy(false);
    }
  };

  return (
    <li>
      <p className="mp-care-text">{donor.label || donor.handle || donor.viewerPk}</p>
      <p className="mp-note-foot">
        <span className="chip">{STATE_NAME[donor.state]}</span>
        {/* いま繋がっている先。**辞書に載っていない人（YouTube から引いた人）は
            名前が引けない**ので、そのときは打った字をそのまま出す。
            「繋がっているのに、何にも繋がっていないように見える」を作らない。 */}
        {(donor.channelName || donor.handle) && (
          <span className="chip">{donor.channelName || donor.handle}</span>
        )}
        {donor.isOwner && <span className="chip">あやと本人</span>}
        {donor.firstSeenAt && (
          <span className="chip">{`${day(donor.firstSeenAt)}に来た`}</span>
        )}
      </p>
      {donor.note && <p className="mp-donor-note">{donor.note}</p>}
      <div className="dform mp-donor-form">
        <label className="nph-post-row">
          <span>どねID</span>
          {/* 書類の id なので直せない。**書けない欄は、彫らずに平らにする** */}
          <input type="text" className="mp-donor-fixed" value={donor.viewerPk} readOnly />
        </label>
        <label className="nph-post-row">
          <span>YouTube の名前</span>
          <input
            type="text"
            value={typed}
            maxLength={80}
            placeholder="@ひめひめ-r9z / UC…"
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={link}>
          {busy ? "つないでいます…" : "つなぐ"}
        </button>
        {/* 禁止ではなく、対等な選択肢。同じ並びに、同じ大きさで置く */}
        <button
          className="mp-send is-small is-quiet"
          disabled={busy}
          onClick={unknown}
        >
          この人は分からない
        </button>
        {donor.canDelete && (
          <button
            className="mp-send is-small is-quiet"
            disabled={busy}
            onClick={drop}
          >
            消す
          </button>
        )}
      </div>
      {said && (
        <p className={bad ? "err" : "mp-donor-said"}>
          {bad && <Icon name="alert" size={13} />} {said}
        </p>
      )}
    </li>
  );
}

/**
 * まだ表に無い人を、先に入れる。
 *
 * Doneru の画面を見ながら、投げ銭が取り込まれるより前に入れておける。
 * ここから入れた行だけ、あとで消せる（毎朝の取り込みが置いた行を消しても、
 * 翌朝また出てくるので、消せるように見せるほうが嘘になる）。
 */
function NewRow({ onChanged }: { onChanged: (d: Donor) => void }) {
  const { token } = useAuth();
  const [pk, setPk] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  const add = async () => {
    const t = await token();
    if (!t) return;
    const id = pk.trim();
    const v = typed.trim();
    if (!id || !v) {
      setBad(true);
      setSaid("どねID と名前の両方を打ってから押してください。");
      return;
    }
    setBusy(true);
    setSaid(null);
    const r = await linkDonor(id, v, t);
    setBusy(false);
    setBad(!r.ok);
    if (r.ok) {
      onChanged(r.donor);
      setPk("");
      setTyped("");
      setSaid(saidOk(v, r.donor, r.via));
    } else if (r.why === "duplicate") {
      setSaid(`${v} は2人に使われています。チャンネルID（UC…）を貼ってください。`);
    } else if (r.why === "notfound") {
      setSaid(`${v} は見つかりませんでした。`);
    } else {
      setSaid("いま送れませんでした。もう一度押してください。");
    }
  };

  return (
    <div className="mp-donor-add">
      <p className="mp-donor-h">
        <b>1人ふやす</b>
        <i>Doneru の画面を見ながら、先に入れておける</i>
      </p>
      <div className="dform mp-donor-form">
        <label className="nph-post-row">
          <span>どねID</span>
          <input
            type="text"
            value={pk}
            maxLength={64}
            placeholder="Doneru に出ている21桁"
            onChange={(e) => setPk(e.target.value)}
          />
        </label>
        <label className="nph-post-row">
          <span>YouTube の名前</span>
          <input
            type="text"
            value={typed}
            maxLength={80}
            placeholder="@ひめひめ-r9z / UC…"
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={add}>
          {busy ? "入れています…" : "入れる"}
        </button>
      </div>
      {said && (
        <p className={bad ? "err" : "mp-donor-said"}>
          {bad && <Icon name="alert" size={13} />} {said}
        </p>
      )}
    </div>
  );
}
