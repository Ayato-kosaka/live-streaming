/**
 * 島で受けた投げ銭が、**アラートの面の中で**ほかの2つ（どねる・スパチャ）と同じ列に並ぶかを見る（#1405）。
 *
 * つなぎ口の単体（`islandTip.test.ts`）では見えないもの:
 *
 *   1. 3つの出どころ（どねる・スパチャ・島）から同時に20件入れても、**順番の乱れ・取りこぼし・二重が0件**
 *      （出した順 = 受け取った順。島の1枚は同じものを2回ずつ届ける）
 *   2. 島の投げ銭は Doneru の donation と同じ道を通り、**豚に全額**が乗る（スパチャは半分）
 *   3. 合言葉が `islandUsers` に無い（テスト用の合言葉。ほかの `/alertbox/{k}/*` が全部 404）晩でも、島の投げ銭は出る
 *   4. `source=doneru,youtube` と書いた URL では、島の1枚を購読しない
 *
 * どねるとスパチャのつなぎ口は偽物（手で起こす）。島は**本物のつなぎ口**で、SDK を取りにいく1か所
 * （`connectors/islandSdk.ts`）だけを差し替え、`onSnapshot` に届く1枚をテストが起こす。
 *
 *   npx jest app/alertbox
 */

import React from "react";
import renderer, { act } from "react-test-renderer";
import { Image } from "react-native";
import type { NotificationData } from "../types";

const K = "0123456789abcdef0123456789abcdef";

const mockParams: { k: string; theme: string; source?: string } = { k: K, theme: "none" };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

/* どねる・スパチャは手で起こす */
const mockWire: { doneru: ((n: NotificationData) => void) | null; youtube: ((n: NotificationData) => void) | null } = {
  doneru: null,
  youtube: null,
};
jest.mock("../connectors", () => ({
  DoneruConnector: class {
    constructor(_wss: string) {}
    start(onEvent: (n: NotificationData) => void) {
      mockWire.doneru = onEvent;
      return () => {
        mockWire.doneru = null;
      };
    }
  },
  YouTubeConnector: class {
    constructor(_k: string) {}
    start(onEvent: (n: NotificationData) => void) {
      mockWire.youtube = onEvent;
      return () => {
        mockWire.youtube = null;
      };
    }
  },
  // 島は本物
  IslandTipConnector: jest.requireActual("../connectors/IslandTipConnector").IslandTipConnector,
}));

/* 島の SDK（`import()`）だけを差し替える */
type Sub = { path: string; next: (s: unknown) => void; error: (e: unknown) => void; unsub: jest.Mock };
const mockFs: { subs: Sub[] } = { subs: [] };
jest.mock("../connectors/islandSdk", () => ({
  loadIslandSdk: async () => ({
    getApps: () => [],
    initializeApp: (options: unknown, name: string) => ({ name, options }),
    getFirestore: () => ({}),
    doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
    onSnapshot: (ref: { path: string }, _o: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
      const unsub = jest.fn();
      mockFs.subs.push({ path: ref.path, next, error, unsub });
      return unsub;
    },
  }),
}));

/* 豚は描かない（.svg を jest が読めない）。渡された額だけ控える */
const mockPig: { current: number | null } = { current: null };
jest.mock("../components/PiggyGauge", () => ({
  PiggyGauge: (p: { currentAmount: number }) => {
    mockPig.current = p.currentAmount;
    return null;
  },
}));

/** 口の答え方。`ok` は全部通す・`404` は合言葉が `islandUsers` に無い晩（全部 404） */
let mode: "ok" | "404" = "ok";
const FUND = 1000;
function installFetch() {
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/island-api/")) {
      if (mode === "404") return { ok: false, status: 404, json: async () => ({}) } as Response;
      if (url.includes("/wss")) return { ok: true, status: 200, json: async () => ({ wss: "wss://example.test/alertbox" }) } as Response;
      if (url.includes("/characters")) return { ok: true, status: 200, json: async () => ({ characters: [] }) } as Response;
      if (url.includes("/fund")) return { ok: true, status: 200, json: async () => ({ currentAmount: FUND, targetAmount: 50000, label: "" }) } as Response;
      if (url.includes("/replay")) return { ok: true, status: 200, json: async () => ({ seq: 0 }) } as Response;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

type LogLine = { event: string; data: Record<string, unknown> };
let logLines: LogLine[] = [];
const logsOf = (event: string) => logLines.filter((l) => l.event === event);

async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let AlertBox: React.ComponentType;
let current: renderer.ReactTestRenderer | null = null;

beforeAll(() => {
  AlertBox = require("../index").default;
  jest.spyOn(console, "log").mockImplementation((line?: unknown) => {
    try {
      const parsed = JSON.parse(String(line));
      if (parsed && typeof parsed.event === "string") logLines.push({ event: parsed.event, data: parsed.data ?? {} });
    } catch {
      /* ログ以外は読み捨てる */
    }
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(Image, "prefetch").mockResolvedValue(true);
});

beforeEach(() => {
  jest.useFakeTimers();
  logLines = [];
  mockFs.subs = [];
  mockWire.doneru = null;
  mockWire.youtube = null;
  mockPig.current = null;
  mockParams.source = undefined;
  mode = "ok";
  installFetch();
});

afterEach(async () => {
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

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(AlertBox));
  });
  await settle();
  current = tree;
  return tree;
}

/** 時計を進めながら、出ている通知が全部はけるまで待つ（1件 30 秒＋フェード） */
async function drain(maxSec: number) {
  for (let t = 0; t < maxSec; t += 5) {
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await settle(3);
  }
}

type Item = { seq: number; who: string; yen: number; text: string; at: number };
const snapOf = (seq: number, items: Item[]) => ({
  exists: () => items.length > 0,
  data: () => ({ seq, items }),
  metadata: { fromCache: false },
});
const live = () => mockFs.subs[mockFs.subs.length - 1];

describe("3つの出どころから同時に20件", () => {
  it("順番の乱れ・取りこぼし・二重が0件。島の分は豚に全額、スパチャは半分", async () => {
    await mount();
    expect(mockWire.doneru).toBeTruthy();
    expect(mockWire.youtube).toBeTruthy();
    expect(mockFs.subs).toHaveLength(1);
    // 島: 起き上がって最初の1枚（まだ1件も無い）
    await act(async () => {
      live().next(snapOf(0, []));
    });

    const sent: string[] = [];
    const items: Item[] = [];
    let want = FUND;
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        const yen = 100 + i * 37; // どれも 1,000円未満（1件 30 秒）
        const who = `テスト${i}`;
        const kind = i % 3;
        if (kind === 0) {
          sent.push(`d-${i}`);
          want += yen;
          mockWire.doneru!({ id: `d-${i}`, type: "donation", amount: yen, assetID: null, message: "m", messageType: 1, nickname: who, test: false });
        } else if (kind === 1) {
          sent.push(`y-${i}`);
          want += Math.floor(yen * 0.5);
          mockWire.youtube!({ id: `y-${i}`, type: "superchat", amount: yen, currency: "¥", jpy: yen, message: "m", nickname: who, test: false });
        } else {
          const seq = items.length + 1;
          items.push({ seq, who, yen, text: "m", at: Date.now() });
          sent.push(`island-${seq}`);
          want += yen;
          const s = snapOf(seq, items.slice(-20));
          // 同じ1枚が2回届く（二重を出さない）
          live().next(s);
          live().next(s);
        }
      }
    });
    await settle();
    await drain(20 * 40);

    const received = logsOf("notificationReceived").map((l) => String(l.data.id));
    const shown = logsOf("notificationDisplayed").map((l) => String(l.data.id));
    const out = (seq: string[]) => ({
      乱れ: seq.filter((id, i) => sent.indexOf(id) !== i).length,
      取りこぼし: sent.filter((id) => !seq.includes(id)).length,
      二重: seq.length - new Set(seq).size,
    });
    expect({ 受けた: out(received), 出した: out(shown) }).toEqual({
      受けた: { 乱れ: 0, 取りこぼし: 0, 二重: 0 },
      出した: { 乱れ: 0, 取りこぼし: 0, 二重: 0 },
    });
    expect(shown).toEqual(sent);
    expect(shown.filter((id) => id.startsWith("island-"))).toHaveLength(6);
    expect(mockPig.current).toBe(want);
  });
});

describe("合言葉が islandUsers に無い晩", () => {
  it("ほかの /alertbox/{k}/* が全部 404 でも、島の投げ銭は出る", async () => {
    mode = "404";
    await mount();
    // ほかの口は本当に 404 だった（どねるにはつながらない）
    expect(logsOf("doneruWssError")).toHaveLength(1);
    expect(mockWire.doneru).toBeNull();
    expect(mockFs.subs).toHaveLength(1);
    expect(live().path).toBe(`islandAlertFeed/${K}`);

    await act(async () => {
      live().next(snapOf(0, []));
    });
    await act(async () => {
      live().next(snapOf(1, [{ seq: 1, who: "テスト1", yen: 500, text: "ためし", at: 0 }]));
    });
    await settle();
    expect(logsOf("notificationDisplayed").map((l) => l.data.id)).toEqual(["island-1"]);
    expect(logsOf("islandConnectorStarted")).toHaveLength(1);
  });
});

describe("source を書いた URL", () => {
  it("source=doneru,youtube では、島の1枚を購読しない", async () => {
    mockParams.source = "doneru,youtube";
    await mount();
    await settle();
    expect(mockFs.subs).toHaveLength(0);
    expect(logsOf("islandConnectorStarted")).toHaveLength(0);
    expect(mockWire.doneru).toBeTruthy();
  });

  it("面を閉じたら、島の購読も外す", async () => {
    const tree = await mount();
    const sub = live();
    await act(async () => {
      tree.unmount();
    });
    current = null;
    expect(sub.unsub).toHaveBeenCalledTimes(1);
  });
});
