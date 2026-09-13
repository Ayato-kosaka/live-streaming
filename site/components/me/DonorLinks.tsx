"use client";

import { useEffect, useState } from "react";
import {
  dropDonor,
  getDonors,
  linkDonor,
  unlinkDonor,
  type Donor,
  type DonorHint,
  type DonorState,
  type DonorVia,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import ReadAgain from "./ReadAgain";
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

/**
 * 「2026-09-06T…」→「9月6日」。島の中の日付はいつもこの形。
 *
 * **日本時間で切る。** 入ってくるのは UTC の時刻（`firstSeenAt` はその人が
 * 初めて投げ銭した時刻、`lastAt` は最後に来た時刻）なので、文字をそのまま
 * 切ると UTC の日付になり、**日本の朝9時より前に来た人が前の日の札**になる。
 * 台帳も島の「今日」も日本時間の0時で切っている（#201・#202・#29）。
 *
 * 日本は夏時間を持たないので、9時間足してから UTC の欄を読めばよい。
 * 読めない字が来たら `null`。**NaN月NaN日を出さない**（#24）。
 */
const day = (iso: string): string | null => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};

/**
 * 候補の下に出す1行。**選ぶときに見るのは、この2つだけ。**
 *
 * 同じ呼び名の人が2人出てくることがある。どちらが本人かは
 * 「どれだけ一緒にいたか」と「さいごに来た日」で見分ける。
 */
function hintMeta(h: DonorHint): string {
  const last = h.lastAt ? day(h.lastAt) : null;
  return [
    h.days !== null ? `一緒に${h.days}日` : null,
    last ? `さいご ${last}` : null,
  ]
    .filter(Boolean)
    .join("・");
}

/**
 * つながったときの1行。**何に繋がったかまで言う。**
 *
 * 打った字と、繋がった先の名前が同じときは、片方だけ。
 * 「@ひめひめ-r9z → @ひめひめ-r9z につながりました」は、読んで何も増えない。
 *
 * **何で引けたか（`VIA_NAME`）を出すのは、打って繋いだときだけ。**
 * 打った人は、その字が何に当たったのかを見て、繋がった先を信じてよいか
 * どうかを決める。候補を押した人は、名前と一緒にいた日数を見てその人を
 * 選んでいるので、もう確かめるものが残っていない。そこに引き方の名前を
 * 出すと、中の話がそのまま画面に出る。**丸かっこごと出さない。**
 */
function saidOk(
  typed: string,
  d: Donor,
  via: DonorVia | null,
  showVia: boolean,
): string {
  const name = d.channelName ?? d.channelId ?? typed;
  const to = name === typed ? typed : `${typed} → ${name}`;
  const said = `${to} につながりました`;
  return showVia ? `${said}（${VIA_NAME[via ?? "dict"]}）` : said;
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
  /** 読めたかどうか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  const [read, setRead] = useState<Read>("wait");
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);

  /* ## 読めなかったときの言い方をそろえる（#34 #36 #43）
   *
   * ここは `catch` で空にして、**「まだ1人も入っていません」**と言い切り、
   * いちばん下に小さく「いま読めませんでした。**電波の届くところで開き直すと
   * 出ます。**」と添えていた。嘘のほうが大きな字で出ていたし、
   * **開き直させないために `online` の読み直しがある**ので、
   * 添え書きの言っていることも島の決めごとと逆だった。
   *
   * 合言葉が取れないときも `return` していたので、**灰色の骨のまま**だった。
   * あれも「読めなかった」。 */
  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const r = await withRead(getDonors(t));
        if (gone) return;
        ok = true;
        miss = 0;
        setRows(r.donors.map((d) => ({ slot: d.state, donor: d })));
        setRead("ok");
      } catch {
        if (gone) return;
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setRows(null);
    setRead("wait");
    go();

    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。 */
    const wake = () => {
      if (ok || gone) return;
      clearTimeout(wait);
      miss = 0;
      go();
    };
    const onShow = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      gone = true;
      clearTimeout(wait);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [token, again]);

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
    <>
      {read === "down" ? (
        /* 読みに行けなかった。**「まだ1人も入っていません」とは別の顔にする。**
           札は島じゅうで1つ（`components/me/ReadAgain.tsx`）。 */
        <ReadAgain what="投げ銭の一覧" onRetry={() => setAgain((n) => n + 1)} />
      ) : rows === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : rows.length === 0 ? (
        <div className="blank">
          <b>まだ1人も入っていません</b>
          <p>分かっている人がいれば、下から先に入れておけます。</p>
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
              {/* **ここも畳む。** 一度「分からない」と決めた人は減らないので、
                  積み上がる一方の並びになる（`components/ui/Longer.tsx`）。 */}
              <Longer items={unknown} first={5} step={10} unit="人" className="mp-care">
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

      {/* 手で入れる口は、**一覧が読めているときだけ開く**（#36 #43）。
          いま誰が入っているかを読めないまま入れると、同じ人をもう1行作る。 */}
      {read === "ok" && <NewRow onChanged={changed} />}
    </>
  );
}

/** ひとまとまり。0人のときは、見出しごと出さない（空の見出しを並べない）。 */
function Group({
  title,
  rows,
  onChanged,
  onDropped,
}: {
  title: string;
  rows: Slot[];
  onChanged: (d: Donor) => void;
  onDropped: (pk: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mp-donor-group">
      <p className="mp-donor-h">
        <b>{title}</b>
      </p>
      {/* 1人ぶんが「名前・いまの状態・書く欄2つ・押しどころ」の4段。
          **新しい人は毎晩入る**ので、はじめは4人だけ出す。
          上から順に片づける道具なので、5人目が見えている必要はない。 */}
      <Longer items={rows} first={4} step={12} unit="人" className="mp-care">
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
  /** 近い名前の人。**紐付け待ちの行にしか来ない**（口がそう返す） */
  const hints = donor.hints ?? [];

  /**
   * つなぐ。**打って押したときも、候補を押したときも、ここを通る。**
   *
   * 道を分けると、押したあとの1行の出し方と `slot` の扱いが2通りになる。
   * `slot` が押しても変わらないのは上の `Slot` に書いた理由なので、
   * 入口を増やしてそこを踏み外さないようにする。
   *
   * `sent` はサーバーに渡す字（打った名前か、候補のチャンネルID）。
   * `picked` は**候補を押したときの、その人**。打って押したときは無い。
   * 見せる字がその人の名前になる（UC から始まる24文字をそのまま出しても、
   * 誰に繋がったのか読めない）のと、引き方を言わないのが、ここで分かれる。
   */
  const send = async (sent: string, picked?: DonorHint) => {
    const t = await token();
    if (!t) return;
    const shown = picked ? picked.name : sent;
    setBusy(true);
    setSaid(null);
    const r = await linkDonor(donor.viewerPk, sent, t);
    setBusy(false);
    setBad(!r.ok);
    if (r.ok) {
      /* **候補は、繋いだあとも残す。** 書く口（POST）は候補を返さないので、
         返ってきた行をそのまま入れると、押した瞬間に候補が消える。
         確認を挟まない画面なので（上の docstring）、押し間違いをその場で
         直せる手が要る。隣の候補をもう一度押せば上書きされる。 */
      onChanged({ ...r.donor, hints: r.donor.hints?.length ? r.donor.hints : hints });
      // 欄も、いま繋がっている人にそろえる（空のまま残すと、次に押せない）
      setTyped(shown);
      setSaid(saidOk(shown, r.donor, r.via, !picked));
    } else if (r.why === "duplicate") {
      setSaid(`${shown} は2人に使われています。チャンネルID（UC…）を貼ってください。`);
    } else if (r.why === "notfound") {
      setSaid(`${shown} は見つかりませんでした。打ち直すか、分からないにしてください。`);
    } else {
      setSaid("いま送れませんでした。もう一度押してください。");
    }
  };

  const link = async () => {
    const v = typed.trim();
    if (!v) {
      setBad(true);
      setSaid("名前を打ってから押してください。");
      return;
    }
    await send(v);
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

  // その人が初めて投げ銭してくれた日（日本時間）。読めない字なら出さない
  const came = donor.firstSeenAt ? day(donor.firstSeenAt) : null;

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
        {came && <span className="chip">{`${came}に来た`}</span>}
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
      {/* 近い名前の人。**打たずに選べるようにする。**
          呼び名は「ゆずたつ」で届くが、繋ぐには `@ゆずたつ-q3n` と
          正確に打たないと当たらない。枝番は誰も思い出せない。
          0件のときは、見出しごと出さない。 */}
      {hints.length > 0 && (
        <div className="mp-donor-hints">
          <p className="mp-donor-hint-h">近い名前の人</p>
          {hints.map((h) => (
            <button
              key={h.channelId}
              className="mp-donor-hint"
              disabled={busy}
              onClick={() => send(h.channelId, h)}
            >
              <b>{h.name}</b>
              {/* 選ぶときに見るのはこの2つ。**どちらも無い人は、名前だけ。**
                  「一緒にいた日数」が多いほど、その名前で来ている人 */}
              <i>{hintMeta(h)}</i>
            </button>
          ))}
        </div>
      )}
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
      setSaid(saidOk(v, r.donor, r.via, true));
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
