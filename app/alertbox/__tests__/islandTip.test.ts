/**
 * 島で受けた投げ銭のつなぎ口（`connectors/IslandTipConnector.ts`。決定の記録 0017・#1405）。
 *
 * Firestore の SDK は本物を使わない。`onSnapshot` を差し替えて、届く1枚をテストが手で起こす。
 * 守りたいのは5つ。
 *
 *   1. **起き上がって最初に受け取った1枚は、控えるだけで出さない**（OBS を開き直した瞬間に、前の投げ銭が流れない）
 *   2. 前に見た `seq` より大きいものだけを、**古い順に**出す
 *   3. 同じ1枚が2回届いても、出すのは1回
 *   4. 止めたら購読を外し、そのあと届いても面へ渡さない
 *   5. エラーは `onError` へ。SDK が購読を終わらせたら、間をあけて付け直す（続きの1枚は控え直さずに出す）
 *
 *   npx jest app/alertbox
 *
 * **対照**（`island-misses.md` #99）: 1 を外した写し（最初の1枚から出す）で回すと、
 * 「最初の1回」の2本だけが赤くなり、ほかは緑のまま（ほかの足は最初の1枚を空の1枚にしてあるので、1 に頼らない）。
 */

import type { NotificationData } from "../types";

/* ---------------- 偽の Firestore ----------------
   SDK を取りにいく1か所（`connectors/islandSdk.ts`。中身は `import()`）を差し替え、`onSnapshot` を偽物にする。
   `IslandTipConnector` は SDK を1回だけ取りにいって関数を握るので、偽物は中身を `mockFs` に預けて、そこへ流すだけにする */
type Sub = {
  path: string;
  options: unknown;
  next: (s: unknown) => void;
  error: (e: unknown) => void;
  unsub: jest.Mock;
};
const mockFs: { subs: Sub[] } = { subs: [] };

jest.mock("../connectors/islandSdk", () => ({
  loadIslandSdk: async () => ({
    getApps: () => [],
    initializeApp: (options: unknown, name: string) => ({ name, options }),
    getFirestore: () => ({ db: true }),
    doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
    onSnapshot: (ref: { path: string }, options: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
      const unsub = jest.fn();
      mockFs.subs.push({ path: ref.path, options, next, error, unsub });
      return unsub;
    },
  }),
}));

// mock を積んでから読む
import { IslandTipConnector, ISLAND_RETRY_MS, toIslandNotification } from "../connectors/IslandTipConnector";
import { parseSourceParam } from "../connectors/sources";

const K = "0123456789abcdef0123456789abcdef";

type Item = { seq: number; who: string; yen: number; text: string; at: number };
const item = (seq: number, yen = 500): Item => ({ seq, who: `テスト${seq}`, yen, text: `ありがとう${seq}`, at: 1_700_000_000_000 + seq });

/** サーバーから届いた1枚（`fromCache: false`） */
const snap = (seq: number, items: Item[], fromCache = false) => ({
  exists: () => true,
  data: () => ({ seq, items, updatedAt: "2026-11-23T00:00:00Z" }),
  metadata: { fromCache },
});
/** まだ1件も無い（書類が無い） */
const none = (fromCache = false) => ({ exists: () => false, data: () => undefined, metadata: { fromCache } });

/** `import()` と then の連鎖を流し切る */
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

/** いま生きている購読（最後に付けたもの） */
const live = () => mockFs.subs[mockFs.subs.length - 1];

async function start() {
  const events: NotificationData[] = [];
  const errors: Error[] = [];
  const stop = new IslandTipConnector(K).start(
    (n) => events.push(n),
    (e) => errors.push(e)
  );
  await flush();
  return { events, errors, stop };
}

const ids = (events: NotificationData[]) => events.map((e) => (e as { id: string }).id);

beforeEach(() => {
  mockFs.subs = [];
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("つなぐ先", () => {
  it("合言葉の1枚（islandAlertFeed/{k}）を、同期の状態の変わり目も込みで購読する", async () => {
    const { stop } = await start();
    expect(mockFs.subs).toHaveLength(1);
    expect(live().path).toBe(`islandAlertFeed/${K}`);
    expect(live().options).toEqual({ includeMetadataChanges: true });
    stop();
  });
});

describe("最初の1回は控えるだけ", () => {
  it("起き上がって最初に受け取った1枚は出さない（中に20件あっても）", async () => {
    const { events, stop } = await start();
    live().next(snap(20, Array.from({ length: 20 }, (_, i) => item(i + 1))));
    expect(events).toHaveLength(0);
    // 控えたあとに来た分は出る（控えが効いている印）
    live().next(snap(21, [...Array.from({ length: 19 }, (_, i) => item(i + 3)), item(21)]));
    expect(ids(events)).toEqual(["island-21"]);
    stop();
  });

  it("手元の写しの1枚（回線がまだ無いうちの「無い」）では控えない。つながって届いた1枚で控える", async () => {
    const { events, stop } = await start();
    live().next(none(true));
    live().next(snap(5, [1, 2, 3, 4, 5].map((s) => item(s))));
    expect(events).toHaveLength(0);
    stop();
  });
});

describe("seq が増えた分だけ、古い順に出す", () => {
  it("増えた3件を、届いた並びにかかわらず seq の小さい順に出す", async () => {
    const { events, stop } = await start();
    live().next(none());
    live().next(snap(3, [item(3), item(1, 10000), item(2, 100)]));
    expect(ids(events)).toEqual(["island-1", "island-2", "island-3"]);
    live().next(snap(5, [item(5), item(1), item(4), item(2), item(3)]));
    expect(ids(events)).toEqual(["island-1", "island-2", "island-3", "island-4", "island-5"]);
    stop();
  });

  it("Doneru の donation と同じ形（同じ7段・豚に全額）。test は偽", async () => {
    const { events, stop } = await start();
    live().next(none());
    live().next(snap(1, [item(1, 7000)]));
    expect(events).toEqual([
      { id: "island-1", type: "donation", amount: 7000, assetID: null, message: "ありがとう1", messageType: 1, nickname: "テスト1", test: false },
    ]);
    expect(toIslandNotification(item(9, 300)).type).toBe("donation");
    stop();
  });

  it("形の違う1件は出さない（額が無い・seq が無い）。ほかの件は出る", async () => {
    const { events, stop } = await start();
    live().next(none());
    live().next(
      snap(3, [item(1), { seq: 2, who: "x", text: "y", at: 0 } as unknown as Item, { who: "z", yen: 100 } as unknown as Item, item(3)])
    );
    expect(ids(events)).toEqual(["island-1", "island-3"]);
    stop();
  });
});

describe("二重を出さない", () => {
  it("同じ1枚が2回届いても1回", async () => {
    const { events, stop } = await start();
    live().next(none());
    const s = snap(2, [item(1), item(2)]);
    live().next(s);
    live().next(s);
    // 同期の状態だけが変わった回（中身は同じ）も来る
    live().next(snap(2, [item(1), item(2)], true));
    live().next(snap(2, [item(1), item(2)]));
    expect(ids(events)).toEqual(["island-1", "island-2"]);
    stop();
  });

  it("作り直された1枚（seq が戻った）は控え直す。前の番号の投げ銭を出し直さない", async () => {
    const { events, stop } = await start();
    live().next(none());
    live().next(snap(9, [item(8), item(9)]));
    expect(ids(events)).toEqual(["island-8", "island-9"]);
    live().next(snap(2, [item(1), item(2)]));
    expect(ids(events)).toEqual(["island-8", "island-9"]);
    live().next(snap(3, [item(1), item(2), item(3)]));
    expect(ids(events)).toEqual(["island-8", "island-9", "island-3"]);
    stop();
  });
});

describe("止めたら", () => {
  it("購読を外し、そのあと SDK から遅れて届いても面へ渡さない", async () => {
    const { events, errors, stop } = await start();
    const sub = live();
    sub.next(none());
    stop();
    expect(sub.unsub).toHaveBeenCalledTimes(1);
    sub.next(snap(1, [item(1)]));
    sub.error({ code: "permission-denied", message: "late" });
    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(0);
    // 付け直しの時計も残らない
    jest.advanceTimersByTime(ISLAND_RETRY_MS.max * 2);
    await flush();
    expect(mockFs.subs).toHaveLength(1);
  });

  it("SDK を取りにいっている途中で止めたら、購読を1本も付けない", async () => {
    const stop = new IslandTipConnector(K).start(
      () => {},
      () => {}
    );
    stop();
    await flush();
    expect(mockFs.subs).toHaveLength(0);
  });
});

describe("エラー", () => {
  it("onError に渡し、5 秒あけて付け直す。付け直した1枚は控え直さず、続きを出す", async () => {
    const { events, errors, stop } = await start();
    live().next(none());
    live().next(snap(1, [item(1)]));
    expect(ids(events)).toEqual(["island-1"]);

    live().error({ code: "permission-denied", message: "Missing or insufficient permissions." });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("permission-denied");
    expect(mockFs.subs).toHaveLength(1);

    jest.advanceTimersByTime(ISLAND_RETRY_MS.first - 1);
    await flush();
    expect(mockFs.subs).toHaveLength(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(mockFs.subs).toHaveLength(2);

    live().next(snap(3, [item(1), item(2), item(3)]));
    expect(ids(events)).toEqual(["island-1", "island-2", "island-3"]);
    stop();
    expect(live().unsub).toHaveBeenCalledTimes(1);
  });

  it("こけ続けたら間を倍にし、上限は 5 分（1時間に20回足らず）", async () => {
    const { errors, stop } = await start();
    const gaps: number[] = [];
    for (let i = 0; i < 9; i++) {
      live().error({ code: "permission-denied", message: "" });
      const n = mockFs.subs.length;
      let waited = 0;
      while (mockFs.subs.length === n) {
        jest.advanceTimersByTime(1000);
        waited += 1000;
        await flush();
      }
      gaps.push(waited);
    }
    expect(errors).toHaveLength(9);
    expect(gaps).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]);
    stop();
  });
});

describe("出どころの読み方（?source=）", () => {
  it("書いていなければ3つとも（OBS・PRISM の URL を貼り替えずに島の投げ銭も受ける）", () => {
    expect(parseSourceParam(undefined)).toEqual(["doneru", "youtube", "island"]);
    expect(parseSourceParam("")).toEqual(["doneru", "youtube", "island"]);
  });

  it("source=doneru,youtube と書いた URL では、島の投げ銭を受けない", () => {
    expect(parseSourceParam("doneru,youtube")).toEqual(["doneru", "youtube"]);
    expect(parseSourceParam(["island"])).toEqual(["island"]);
    expect(parseSourceParam(" Island , doneru,island")).toEqual(["island", "doneru"]);
  });

  it("知らない名前だけなら3つとも（前と同じ）", () => {
    expect(parseSourceParam("twitch")).toEqual(["doneru", "youtube", "island"]);
  });
});
