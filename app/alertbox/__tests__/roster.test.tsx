/**
 * 名簿の**取り直し**と、当たらなかったときの**足あと**を見る。
 *
 * ここが守りたいのは1つだけ。
 * **取り直しがこけた回に、いま持っている名簿を捨てないこと。**
 * 捨てると、それまで出ていた人まで既定の絵に落ちる。しかも画面には
 * 何も出ない（配信に映るので）ので、あやとからは「キャラクターが
 * 出なくなった」としか見えない。
 *
 *   npx jest app/alertbox
 *
 * **対照を先に置く**（`island-misses.md` #99）。1回目からこけた場合に
 * ちゃんと「当たらない」ことを見てから、「1回目成功・2回目失敗でも
 * 当たり続ける」を見る。そうしないと、当たっているように見えるだけの
 * 仕掛け（絵を出しっぱなしにしているだけ、など）と区別がつかない。
 */

import React from "react";
import renderer, { act } from "react-test-renderer";
import { Image } from "react-native";
import type { AlertboxCharacter, NotificationData } from "../types";
import { describeNickname } from "../matching.utils";

/* OBS の URL に載る 32 桁の合言葉。形が合っていないと、口にも
   つなぎ先にも行かない（`index.tsx` が先に止める）。 */
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    k: "0123456789abcdef0123456789abcdef",
    source: "doneru",
  }),
}));

/* つなぎ先は本物を使わない（WebSocket を開いてしまう）。
   代わりに「投げ銭が来た」を手で起こせるようにする。 */
const mockWire: { emit: ((n: NotificationData) => void) | null } = {
  emit: null,
};
jest.mock("../connectors", () => ({
  DoneruConnector: class {
    constructor(_wss: string) {}
    start(onNotification: (n: NotificationData) => void) {
      mockWire.emit = onNotification;
      return () => {};
    }
  },
  YouTubeConnector: class {
    constructor(_k: string) {}
    start() {
      return () => {};
    }
  },
}));

/* ブタの貯金箱だけは差し替える。中身が `.svg` の読み込みで、jest には
   metro の変換が無いので**描こうとすると落ちる**。見たいのは名簿なので、
   ここは空にしておく（本物は本番の書き出しで描かれている）。 */
jest.mock("../components/PiggyGauge", () => ({ PiggyGauge: () => null }));

/** 名簿に載っている1人。絵は原寸。 */
const AOI_ICON = "https://example.test/aoi-full.png";
const CHARS: AlertboxCharacter[] = [
  {
    id: "aoi",
    emoji: "🌊",
    channelName: "@aoi",
    aliases: ["あおい"],
    plain: { full: AOI_ICON, sizes: { "256": "aoi256" }, w: null, h: null },
    scene: null,
  },
];

/* 偽の口。`/characters` だけ、1回ごとに「通す / こける」をテストが決める。
   ほかの口（Goals・どね額・ログ）は通しておく。落とすと `DeadMark` が
   出て、見たいものと関係ない差が出る。 */
const characters: ("ok" | "fail")[] = [];
let charactersCalls = 0;

/** sendLog が吐く1行。生の名前は入っていない前提でここを読む */
type LogLine = { event: string; data: Record<string, unknown> };
let logLines: LogLine[] = [];

const logsOf = (event: string) => logLines.filter((l) => l.event === event);

function installFetch() {
  charactersCalls = 0;
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/characters")) {
      const plan = characters[charactersCalls] ?? "fail";
      charactersCalls += 1;
      if (plan === "fail") {
        return { ok: false, status: 503, statusText: "fail" } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ characters: CHARS }),
      } as Response;
    }
    if (url.includes("/wss")) {
      return {
        ok: true,
        json: async () => ({ wss: "wss://example.test/alertbox" }),
      } as Response;
    }
    if (url.includes("table=Goals")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          table: "Goals",
          data: {
            id: "2025-10-24",
            startAmount: 0,
            superChatAmount: 0,
            doneruGoalKey: "key",
            targetAmount: 1,
            label: "",
          },
        }),
      } as Response;
    }
    if (url.includes("doneruAmount")) {
      return { ok: true, json: async () => ({ amount: 0 }) } as Response;
    }
    // ログの送り先ほか
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

/** 投げ銭1件（金額0・動画なしなので、絵の枝に入る） */
const donation = (nickname: string): NotificationData => ({
  id: "n1",
  amount: 0,
  assetID: null,
  message: "ありがとう",
  messageType: 1,
  nickname,
  test: true,
  type: "donation",
});

/** 何度か待って、走っている非同期をぜんぶ流し切る */
async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** いま画面に出ている絵の URL（出ていなければ null） */
function shownImage(tree: renderer.ReactTestRenderer): string | null {
  const imgs = tree.root.findAllByType(Image);
  for (const img of imgs) {
    const src = img.props.source;
    if (src && typeof src === "object" && typeof src.uri === "string") {
      return src.uri;
    }
  }
  return null;
}

let AlertBox: React.ComponentType;

beforeAll(() => {
  // 実際の import は mock を積んでから
  AlertBox = require("../index").default;

  /* `sendLog` は送る前に1行 `console.log` する。**そこを読む。**
     ログの中身そのものを見たいので、送り先を mock せずにここで拾う。
     テストが終わったあとに届く1行も黙らせたいので、戻さない。 */
  jest.spyOn(console, "log").mockImplementation((line?: unknown) => {
    try {
      const parsed = JSON.parse(String(line));
      if (parsed && typeof parsed.event === "string") {
        logLines.push({ event: parsed.event, data: parsed.data ?? {} });
      }
    } catch {
      /* ログ以外の出力は読み捨てる */
    }
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(Image, "prefetch").mockResolvedValue(true);
});

beforeEach(() => {
  jest.useFakeTimers();
  logLines = [];
  characters.length = 0;
  mockWire.emit = null;
  installFetch();
});

afterEach(async () => {
  /* 片づけまでテストの中でやる。閉じたあとに届くログが
     「テストが終わってから log した」と言われるのを避ける。 */
  if (current) {
    const tree = current;
    current = null;
    await act(async () => {
      tree.unmount();
    });
    await settle(2);
  }
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/** いま立っている画面（後片づけ用） */
let current: renderer.ReactTestRenderer | null = null;

/** 画面を立ち上げて、初回の取得が終わるまで待つ */
async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(AlertBox));
  });
  await settle();
  current = tree;
  return tree;
}

/** 10分進めて、取り直しが1回走るのを待つ */
async function advanceRefresh() {
  await act(async () => {
    jest.advanceTimersByTime(10 * 60 * 1000);
  });
  await settle();
}

/** 投げ銭を1件流して、絵が決まるまで待つ */
async function fire(tree: renderer.ReactTestRenderer, nickname: string) {
  expect(mockWire.emit).toBeTruthy();
  await act(async () => {
    mockWire.emit!(donation(nickname));
  });
  await settle();
  return shownImage(tree);
}

describe("名簿の取り直し", () => {
  it("取り直しは10分より短くしない（それまでは1回しか取りに行かない）", async () => {
    characters.push("ok", "ok");
    await mount();
    expect(charactersCalls).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(9 * 60 * 1000);
    });
    await settle();
    expect(charactersCalls).toBe(1);

    await advanceRefresh();
    expect(charactersCalls).toBe(2);
  });

  /* ---- 対照。**先にこちらを見る**（#99） ---- */
  it("対照: 1回目からこけていると、当たらない（既定の絵に落ちる）", async () => {
    characters.push("fail", "fail");
    const tree = await mount();
    await advanceRefresh();
    expect(charactersCalls).toBe(2);

    const shown = await fire(tree, "@aoi");
    // その人の絵ではない（通知タイプごとの既定の絵）
    expect(shown).not.toBe(AOI_ICON);

    // 当たらなかったことが1行残る。**名簿が0人**だったことも分かる
    const missed = logsOf("viewerNotMatched");
    expect(missed).toHaveLength(1);
    expect(missed[0].data.roster).toBe(0);
    expect(missed[0].data.rosterEmpty).toBe(true);
  });

  /* ---- ここがこの変更の肝 ---- */
  it("1回目成功・2回目失敗でも、名簿は残って当たり続ける", async () => {
    characters.push("ok", "fail");
    const tree = await mount();
    await advanceRefresh();
    expect(charactersCalls).toBe(2);

    // 2回目はこけている。**こけたことは記録され、抱えている人数も出る**
    const failed = logsOf("fetchCharactersError");
    expect(failed).toHaveLength(1);
    expect(failed[0].data.kept).toBe(2); // @aoi と あおい の2行

    const shown = await fire(tree, "@aoi");
    expect(shown).toBe(AOI_ICON);
    expect(logsOf("viewerNotMatched")).toHaveLength(0);
  });

  it("こけたあとに通れば、新しい名簿に入れ替わる", async () => {
    characters.push("fail", "ok");
    const tree = await mount();
    expect(await fire(tree, "@aoi")).not.toBe(AOI_ICON);

    await advanceRefresh();
    expect(await fire(tree, "@aoi")).toBe(AOI_ICON);
  });
});

describe("当たらなかったときの足あと", () => {
  it("名簿は居るのに当たらないときは、rosterEmpty が false で出る", async () => {
    characters.push("ok");
    const tree = await mount();

    await fire(tree, "まったく知らない人");

    const missed = logsOf("viewerNotMatched");
    expect(missed).toHaveLength(1);
    expect(missed[0].data.roster).toBe(2);
    expect(missed[0].data.rosterEmpty).toBe(false);
    expect(missed[0].data.len).toBe("まったく知らない人".length);
  });

  it("当たったときは、1行も残さない", async () => {
    characters.push("ok");
    const tree = await mount();
    await fire(tree, "あおい");
    expect(logsOf("viewerNotMatched")).toHaveLength(0);
  });

  it("生の名前をログに足していない", async () => {
    characters.push("ok");
    const tree = await mount();
    const name = "だれでもない人";
    await fire(tree, name);

    const missed = logsOf("viewerNotMatched");
    expect(missed).toHaveLength(1);
    expect(JSON.stringify(missed[0].data)).not.toContain(name);
  });
});

describe("describeNickname（名前の形だけを返す）", () => {
  it("字そのものは返さない", () => {
    const shape = describeNickname("あおい");
    expect(JSON.stringify(shape)).not.toContain("あおい");
  });

  it("長さは符号位置で数える（絵文字を2と数えない）", () => {
    expect(describeNickname("あおい").len).toBe(3);
    expect(describeNickname("あおい🌊").len).toBe(4);
  });

  it("見えない字が入っていたら invisible", () => {
    expect(describeNickname("あ​おい").invisible).toBe(true);
    expect(describeNickname("あおい").invisible).toBe(false);
    // 2回続けて見ても同じ答え（`g` 付き正規表現の位置に引きずられない）
    expect(describeNickname("あ​おい").invisible).toBe(true);
  });

  it("前後の空白・全角英字・絵文字も、それぞれ分かれて出る", () => {
    expect(describeNickname("  aoi  ").padded).toBe(true);
    expect(describeNickname("ＡＯＩ").widened).toBe(true);
    expect(describeNickname("aoi🌊").emoji).toBe(true);
    expect(describeNickname("aoi").padded).toBe(false);
    expect(describeNickname("aoi").widened).toBe(false);
    expect(describeNickname("aoi").emoji).toBe(false);
  });

  it("正規化で落ちたぶんは normLen に出る", () => {
    const shape = describeNickname("  aoi​  ");
    expect(shape.len).toBe(8);
    expect(shape.normLen).toBe(3);
  });

  it("空でも落ちない", () => {
    expect(describeNickname("").len).toBe(0);
    expect(describeNickname(null).len).toBe(0);
  });
});
