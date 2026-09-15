/**
 * @jest-environment jsdom
 */

/**
 * 投げ銭の動画が、**届く前に ▶ の板を出さない**ことを見る。
 *
 * あやとが Android で撮った絵は、動画そのものではなく `<video>` が中身を
 * 持っていないときに WebView が描く再生ボタンだった。守りたいのは3つ。
 *
 *   1. 動き出すまで `<video>` は見せない。そのあいだは**その人の絵**が出ている
 *   2. 動き出さなければ**絵のまま止まる**（アラートは出たまま）
 *   3. **絵だけの人**（101人中100人）は、いままでどおり。動画の要素は1つも置かない
 *
 * `still=1`（iPhone から配信する日）のときは、動画を持つ人でも絵にして、
 * **1バイトも落としに行かない**ことまで見る。
 *
 *   npx jest app/alertbox
 *
 * **対照を先に置く**（`island-misses.md` #99）。「絵だけの人には `<video>` が
 * 無い」を先に見てから「動画の人には有る」を見る。そうしないと、
 * `<video>` を探す道具が壊れていても全部通ってしまう。
 *
 * この画面は `Platform.OS === "web"` のときしか動画に行かない。jest-expo の
 * 既定は ios なので、**ここだけ web に差し替えて**、jsdom を敷いている
 * （`document.createElement("video")` が要る）。
 */

import React from "react";
import renderer, { act } from "react-test-renderer";
import { Image, Platform } from "react-native";
import type { AlertboxCharacter, NotificationData } from "../types";

/* jsdom には `setImmediate` が無い。react-native の `InteractionManager`
   （`Animated.timing(...).start()` の中）がそれを呼ぶので、先に敷いておく。
   **無いとアラートが出る手前で落ちて、見たいものに辿り着かない。** */
if (typeof (global as { setImmediate?: unknown }).setImmediate === "undefined") {
  Object.assign(global, {
    setImmediate: (fn: (...a: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(fn, 0, ...args),
    clearImmediate: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
}

/* 動画の枝に入るのは web だけ。**index を読み込む前に差し替える。** */
Object.defineProperty(Platform, "OS", {
  value: "web",
  configurable: true,
  writable: true,
});

/* jsdom の `HTMLMediaElement.load()` は「実装していない」を吐く。
   温めが本当に落としに行くかはここでは見ない（見るのは
   **何回始めたか**で、それは `videoPreloadStart` のログに出る）。 */
Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
  configurable: true,
  value: jest.fn(),
});

/** OBS の URL。テストごとに `still` を差し替える */
const urlParams: { k: string; source: string; still?: string } = {
  k: "0123456789abcdef0123456789abcdef",
  source: "doneru",
};
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => urlParams,
}));

/* つなぎ先は本物を使わない（WebSocket を開いてしまう）。 */
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

/* ブタの貯金箱は `.svg` を読むので jest では描けない。 */
jest.mock("../components/PiggyGauge", () => ({ PiggyGauge: () => null }));

/** 動画を持っている人（本番でも101人中1人だけ） */
const MOV_ICON = "https://example.test/mov-icon.png";
const MOV_URL = "https://example.test/mov.mp4";
/** 絵しか持っていない人（残りの100人） */
const PIC_ICON = "https://example.test/pic-icon.png";

const CHARS: AlertboxCharacter[] = [
  {
    id: "mov",
    emoji: "",
    channelName: "@mov",
    aliases: [],
    plain: { full: MOV_ICON, sizes: {}, w: null, h: null },
    scene: null,
    videoUrl: MOV_URL,
  },
  {
    id: "pic",
    emoji: "",
    channelName: "@pic",
    aliases: [],
    plain: { full: PIC_ICON, sizes: {}, w: null, h: null },
    scene: null,
  },
];

/** `/characters` を何回叩かれたか（取り直しの回数） */
let charactersCalls = 0;

type LogLine = { event: string; data: Record<string, unknown> };
let logLines: LogLine[] = [];
const logsOf = (event: string) => logLines.filter((l) => l.event === event);

function installFetch() {
  charactersCalls = 0;
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/characters")) {
      charactersCalls += 1;
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
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

/** 投げ銭1件。金額は動画の枝に入る条件（>= 0）を満たす */
const donation = (nickname: string): NotificationData => ({
  id: "n1",
  amount: 1000,
  assetID: null,
  message: "ありやとう",
  messageType: 1,
  nickname,
  test: true,
  type: "donation",
});

async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 画面に出ている `<Image>` の URL を全部 */
function images(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Image)
    .map((img) => img.props.source?.uri)
    .filter((uri: unknown): uri is string => typeof uri === "string");
}

/** 画面に置かれている `<video>`（無ければ空） */
function videos(tree: renderer.ReactTestRenderer) {
  return tree.root.findAllByType("video" as unknown as React.ComponentType);
}

/** `<video>` が見えているか（透明なら見えていない） */
function videoVisible(tree: renderer.ReactTestRenderer): boolean {
  const [v] = videos(tree);
  if (!v) return false;
  return (v.props.style?.opacity ?? 1) !== 0;
}

let AlertBox: React.ComponentType;

/** `videoRef` の中身。react-test-renderer は host の実体を作らないので手で渡す */
const fakeVideoEl = {
  readyState: 0,
  networkState: 0,
  paused: true,
  duration: 3,
  currentTime: 0,
  play: jest.fn(() => Promise.resolve()),
  pause: jest.fn(),
};

beforeAll(() => {
  AlertBox = require("../index").default;

  /* `sendLog` は送る前に1行 `console.log` する。そこを読む。 */
  jest.spyOn(console, "log").mockImplementation((line?: unknown) => {
    try {
      const parsed = JSON.parse(String(line));
      if (parsed && typeof parsed.event === "string") {
        logLines.push({ event: parsed.event, data: parsed.data ?? {} });
      }
    } catch {
      /* ログ以外は読み捨てる */
    }
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(Image, "prefetch").mockResolvedValue(true);
});

let current: renderer.ReactTestRenderer | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  logLines = [];
  mockWire.emit = null;
  delete urlParams.still;
  fakeVideoEl.play.mockClear();
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
    tree = renderer.create(React.createElement(AlertBox), {
      createNodeMock: (el) =>
        (el.type as unknown) === "video" ? fakeVideoEl : null,
    });
  });
  await settle();
  current = tree;
  return tree;
}

/** 10分進めて、名簿の取り直しを1回走らせる */
async function advanceRefresh() {
  await act(async () => {
    jest.advanceTimersByTime(10 * 60 * 1000);
  });
  await settle();
}

/** 投げ銭を1件流す */
async function fire(tree: renderer.ReactTestRenderer, nickname: string) {
  expect(mockWire.emit).toBeTruthy();
  await act(async () => {
    mockWire.emit!(donation(nickname));
  });
  await settle();
}

/** `<video>` の `playing`（＝再生が始まった）を起こす */
async function firePlaying(tree: renderer.ReactTestRenderer) {
  const [v] = videos(tree);
  expect(v).toBeTruthy();
  await act(async () => {
    v.props.onPlaying({ currentTarget: fakeVideoEl });
  });
  await settle(2);
}

describe("絵だけの人（101人中100人）", () => {
  /* ---- 対照。**先にこちらを見る**（#99） ---- */
  it("動画の要素を1回も置かない。絵はすぐ出る", async () => {
    const tree = await mount();
    await fire(tree, "@pic");

    expect(videos(tree)).toHaveLength(0);
    expect(images(tree)).toContain(PIC_ICON);
  });

  it("動画を持たない人のために、動画を落としに行かない", async () => {
    const tree = await mount();
    await fire(tree, "@pic");

    // 温めたのは動画を持つ1人ぶんだけ（この人のぶんは無い）
    const started = logsOf("videoPreloadStart").map((l) => l.data.url);
    expect(started).toEqual([MOV_URL]);
  });
});

describe("動画を持つ人", () => {
  it("動き出すまで `<video>` は見せない。出ているのはその人の絵", async () => {
    const tree = await mount();
    await fire(tree, "@mov");

    // 要素は置かれている（置かないと自動再生が始まらない）
    expect(videos(tree)).toHaveLength(1);
    // でも見えていない
    expect(videoVisible(tree)).toBe(false);
    // 見えているのは**その人の絵**（既定のアラート画像ではない）
    expect(images(tree)).toContain(MOV_ICON);
  });

  it("再生が始まったら、動画に変わって絵が消える", async () => {
    const tree = await mount();
    await fire(tree, "@mov");
    expect(videoVisible(tree)).toBe(false);

    await firePlaying(tree);

    expect(videoVisible(tree)).toBe(true);
    expect(images(tree)).not.toContain(MOV_ICON);
  });

  it("ループする（アラートのほうが動画より長い）", async () => {
    const tree = await mount();
    await fire(tree, "@mov");

    const [v] = videos(tree);
    expect(v.props.loop).toBe(true);
  });

  it("音は付けない（付けると自動再生そのものが始まらない）", async () => {
    const tree = await mount();
    await fire(tree, "@mov");

    const [v] = videos(tree);
    expect(v.props.muted).toBe(true);
  });
});

describe("動画が来ないとき", () => {
  it("数秒待っても再生が始まらなければ、絵のまま止まる", async () => {
    const tree = await mount();
    await fire(tree, "@mov");
    expect(videos(tree)).toHaveLength(1);

    // `playing` が来ないまま待つ
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await settle();

    // 動画は下ろされ、絵だけが残る
    expect(videos(tree)).toHaveLength(0);
    expect(images(tree)).toContain(MOV_ICON);
    expect(logsOf("videoStartTimeout")).toHaveLength(1);
  });

  it("待っているあいだも、アラートは出ている", async () => {
    const tree = await mount();
    await fire(tree, "@mov");

    // 待つ前も、待ったあとも、アラートの箱は出たまま
    expect(images(tree).length).toBeGreaterThan(0);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await settle();
    expect(images(tree).length).toBeGreaterThan(0);
  });

  it("再生が始まっていれば、待ち時間を過ぎても下ろさない", async () => {
    const tree = await mount();
    await fire(tree, "@mov");
    await firePlaying(tree);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await settle();

    expect(videos(tree)).toHaveLength(1);
    expect(videoVisible(tree)).toBe(true);
    expect(logsOf("videoStartTimeout")).toHaveLength(0);
  });
});

describe("温めるのは名簿が来た時点", () => {
  it("アラートより前に、もう温め始めている", async () => {
    await mount();
    // 投げ銭は1件も来ていないのに、もう始まっている
    expect(logsOf("videoPreloadStart").map((l) => l.data.url)).toEqual([
      MOV_URL,
    ]);
  });

  it("名簿を取り直しても、同じ URL を温め直さない", async () => {
    await mount();
    expect(logsOf("videoPreloadStart")).toHaveLength(1);

    await advanceRefresh();
    await advanceRefresh();
    expect(charactersCalls).toBe(3); // 名簿は3回取りに行っている

    // それでも温めは1回だけ
    expect(logsOf("videoPreloadStart")).toHaveLength(1);
  });

  it("アラートが出ても、もう一度は落としに行かない", async () => {
    const tree = await mount();
    await fire(tree, "@mov");
    expect(logsOf("videoPreloadStart")).toHaveLength(1);
  });
});

describe("still=1（iPhone から配信する日）", () => {
  /* iOS の WebView は動画を別のレイヤに描くので、画面キャプチャに写らない。
     その日は動画をまるごと出さない。 */
  it("動画を持つ人でも、絵が出る（動画の要素を1回も置かない）", async () => {
    urlParams.still = "1";
    const tree = await mount();
    await fire(tree, "@mov");

    expect(videos(tree)).toHaveLength(0);
    expect(images(tree)).toContain(MOV_ICON);
  });

  it("動画を1バイトも落としに行かない（温めもしない）", async () => {
    urlParams.still = "1";
    const tree = await mount();
    await advanceRefresh();
    await fire(tree, "@mov");

    expect(logsOf("videoPreloadStart")).toHaveLength(0);
  });

  it("still=true でも同じ", async () => {
    urlParams.still = "true";
    const tree = await mount();
    await fire(tree, "@mov");

    expect(videos(tree)).toHaveLength(0);
    expect(logsOf("videoPreloadStart")).toHaveLength(0);
  });

  /* ---- 既定は変えない ---- */
  it("still=0 は、いままでどおり動画が出る", async () => {
    urlParams.still = "0";
    const tree = await mount();
    await fire(tree, "@mov");

    expect(videos(tree)).toHaveLength(1);
    expect(logsOf("videoPreloadStart")).toHaveLength(1);
  });

  it("still を付けなければ、いままでどおり動画が出る", async () => {
    const tree = await mount();
    await fire(tree, "@mov");

    expect(videos(tree)).toHaveLength(1);
  });

  it("still=1 でも、絵だけの人の見え方は変わらない", async () => {
    urlParams.still = "1";
    const tree = await mount();
    await fire(tree, "@pic");

    expect(videos(tree)).toHaveLength(0);
    expect(images(tree)).toContain(PIC_ICON);
  });
});
