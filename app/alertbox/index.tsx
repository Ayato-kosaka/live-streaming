// AlertBox コンポーネント
// - 視聴者情報(GAS)の取得と名前正規化
// - WebSocket からの通知受信とキュー処理
// - 通知の表示/非表示アニメーション、画像プリフェッチ
// - 寄付金額に応じた表示時間の調整、TTS 読み上げ
// - 視聴者設定に応じた絵文字エフェクト表示

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { View, Text, Animated, Image, TextStyle, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { settings } from "./config";
import { styles } from "./styles";
import { FireworkDisplay, RainEffect } from "./components";
import {
  NotificationData,
  AlertViewer,
  GoalState,
  SuperChatRecord,
  GoalRecord,
} from "./types";
import { PiggyGauge } from "./components/PiggyGauge";
import { DeadMark } from "./components/DeadMark";
import { sendLog } from "@/lib/log";
import {
  describeNickname,
  matchViewerByNickname,
  toViewers,
} from "./matching.utils";
import { speak } from "./tts.utils";
import { getMainTextStyle, getSubMessageStyle } from "./styles.utils";
import { DoneruConnector, YouTubeConnector } from "./connectors";
import {
  getById,
  insert,
  getDoneruAmount,
  getAlertboxWss,
  getAlertboxCharacters,
} from "./api.utils";

// 受け付け可能な通知タイプのリスト（ガードに利用）
const NOTIFICATION_TYPES = [
  "donation",
  "superchat",
  "youtubeSubscriber",
  "membership",
] as const satisfies readonly NotificationData["type"][];

// Goals テーブルのレコード ID（要件により固定）
const GOAL_ID = "2025-10-24";

// SuperChat 金額を currentAmount に加算する際の換算レート
// 仕様: JPY 金額の 1/2 を目標金額に加算
const SUPERCHAT_CONVERSION_RATE = 0.5;

/* 名簿を取り直す間隔（10分）。
   OBS のブラウザソースは配信のあいだ開きっぱなしなので、これが無いと
   **名簿を直してもブラウザソースを開き直すまで効かない。** 配信中の
   あやとに「開き直して」と言わせないための下限がここ。
   配信4時間でも24回しか叩かないので、口の負担にはならない。 */
const CHARACTERS_REFRESH_MS = 10 * 60 * 1000;

/* 動画が**動き出すのを待つ上限**。ここを過ぎたら絵のままにする。
   - 投げ銭のアラートは 30 秒出ている（`config.ts` の `alertDuration`）ので、
     3秒待っても残り 27 秒は絵が出る。
   - 温め（`preloadVideo`）が諦めるのと同じ長さにしてある。温めが3秒で
     届かないものは、本物の `<video>` でも3秒では届かない。
   **待っているあいだ、画面はその人の絵。** 何も出ない時間は作らない。 */
const VIDEO_START_TIMEOUT_MS = 3000;

export default function AlertBox() {
  // Parse URL parameters for source selection
  /* `k` は OBS の URL に載せる 32 桁の合言葉（#180）。
     **鍵ではない。** これを見せた相手にサーバーが鍵を使ってくれる、
     という引換券。漏れたら /me から作り直せる（Doneru の鍵は作り直せない）。 */
  const params = useLocalSearchParams<{
    source?: string;
    k?: string;
    still?: string;
  }>();

  /* 名前ごとに1つ。**1人が名前を何個も持つ**（チャンネル名 + 他の呼び名）
     ので、当てる相手はここで開いて並べ直したもの。 */
  const [normViewers, setNormViewers] = useState<AlertViewer[]>([]);

  /* 同じ名簿を ref にも持つ。**通知を受け取る関数は初期化のときに1度しか
     作られない**ので、そこから state をそのまま読むと、取り直したあとも
     最初の空の名簿を見続ける。当てるのは画面側（`matchedViewer`）の仕事で、
     こちらは「当たったかどうか」をログに残すためだけに読む。 */
  const normViewersRef = useRef<AlertViewer[]>([]);

  // Goals 情報（起動時に取得し currentAmount を算出して保持）
  const [goal, setGoal] = useState<GoalState | null>(null);

  // 現在表示中の通知（なければ null）
  const [notification, setNotification] = useState<NotificationData | null>(
    null
  );

  // 現在表示中メディア（画像/動画）
  const [displaySource, setDisplaySource] = useState<{
    type: "image" | "video";
    url: string | null;
  }>({
    type: "image",
    url: null,
  });

  /* 動画が**実際に動き出したか。** 動き出すまで `<video>` は見せない。
     置かないのではなく、置いたまま透明にしておく（`display:none` にすると
     自動再生そのものが始まらないブラウザがある）。
     見えているあいだは、その人の絵が上に乗っている。 */
  const [videoStarted, setVideoStarted] = useState(false);

  /* 出すものを差し替える。**必ずここを通す。**
     `setDisplaySource` を直に呼ぶと、前の動画の「もう動き出している」が
     残ったまま次の動画が透明でなくなって、また ▶ の板が出る。 */
  const showSource = useCallback(
    (next: { type: "image" | "video"; url: string | null }) => {
      setVideoStarted(false);
      setDisplaySource(next);
    },
    []
  );

  // 未処理の通知キュー（受信順に積まれて処理される）
  const [notificationQueue, setNotificationQueue] = useState<
    NotificationData[]
  >([]);

  // メインメッセージのスタイル（通知タイプに応じて切り替え）
  const mainTextStyle: TextStyle = useMemo(
    () => getMainTextStyle(notification ?? undefined),
    [notification]
  );

  // サブメッセージ（本文）のスタイル（寄付系のみ表示）
  const messageStyle: TextStyle = useMemo(
    () => getSubMessageStyle(notification ?? undefined),
    [notification]
  );

  // フェードイン/アウト用アニメーション値
  const [opacity] = useState(new Animated.Value(0));

  // セッション識別子（ログ相関用）
  const sessionId = useRef(new Date().getTime());

  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* **ここが死んだ、という印だけを持つ。**
     入るのは理由の符丁（"init" / "no-k" / "wss"）で、画面には出さない。
     出すのは隅の小さな点1つ（`DeadMark`）。なぜ字をやめたかは
     `components/DeadMark.tsx` に書いてある。
     **理由はログにだけ残す**（`sendLog`）。 */
  const [dead, setDead] = useState<"init" | "no-k" | "wss" | null>(null);

  /**
   * Parse source parameter to determine which connectors to use
   * @returns Array of connector types to initialize
   */
  const parseSourceParam = (sourceParam?: string | string[]): string[] => {
    // Handle array case (shouldn't happen but for safety)
    const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;

    if (!source) {
      // Default: both connectors
      return ["doneru", "youtube"];
    }

    // Split by comma and normalize
    const sources = source
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s === "doneru" || s === "youtube");

    // If invalid or empty, default to both
    return sources.length > 0 ? sources : ["doneru", "youtube"];
  };

  const enabledSources = useMemo(
    () => parseSourceParam(params.source),
    [params.source]
  );

  /** OBS の URL の `?k=`。無ければ空。 */
  const alertboxId = String(params.k ?? "");

  /* OBS の URL の `?still=1`。**動画を1回も出さない。**
     iPhone の WebView は動画を別のレイヤに描くので、**画面キャプチャに
     動画が写らない**（黒く抜ける）。iPhone から配信する日は、動画を
     持っている人も絵にする。
     既定は今までどおり（付けなければ動画が出る）。 */
  const stillOnly = useMemo(() => {
    const raw = Array.isArray(params.still) ? params.still[0] : params.still;
    const v = String(raw ?? "").trim().toLowerCase();
    return v === "1" || v === "true";
  }, [params.still]);

  useEffect(() => {
    // 画面起動ログ
    sendLog("AlertBox", sessionId, "mount", { enabledSources });

    /* キャラクターの名簿。**スプレッドシートではない**（#284）。
       原本は Firestore で、合言葉(`k`)を持っている人だけが読める。

       **名前ごとに1つへ開く。** 1人がチャンネル名と他の呼び名を持って
       いるので、表が141行あったのと同じ形に戻してから当てる
       （`matching.utils.ts` はこの形を待っている）。

       **落ちても、ここで止めない。** 名簿はアラートの飾りで、前提ではない。
       取れなければ通知タイプごとの既定の絵が出るだけで、通知そのものは
       ちゃんと出る。ひとつの口が落ちた日に、ブタの貯金箱まで消さない
       （前は Viewers がこけると Goals も doneruAmount も止まっていた）。 */
    const fetchCharacters = async () => {
      try {
        const characters = await getAlertboxCharacters(alertboxId);
        const normViewers = toViewers(characters);
        /* **差し替えるのは取れたときだけ。** 下の catch で空にしない。
           取り直しがこけた回に名簿を捨てると、それまで出ていた人まで
           既定の絵に落ちる。いちばん悪い壊れ方なので、こけた回は
           「前の名簿のまま」で通す。 */
        normViewersRef.current = normViewers;
        setNormViewers(normViewers);
        sendLog("AlertBox", sessionId, "fetchCharactersSuccess", {
          characters: characters.length,
          names: normViewers.length,
          /* **絵の無い人は当たっても既定の絵になる。** 数だけ見えるように
             しておく（名前は出さない。ログは誰でも読める） */
          withIcon: normViewers.filter((v) => v.iconUrl).length,
          withVideo: normViewers.filter((v) => v.videoUrl).length,
        });
      } catch (error) {
        /* **絵が出ないだけ。** 画面には出さない（配信に映るので）。
           **ここで名簿を空にしない。** 取り直しがこけただけで、
           前に取れていたものは今も正しい。 */
        sendLog("AlertBox", sessionId, "fetchCharactersError", {
          error: String(error),
          // 何人ぶん抱えたまま続けるのか。0 なら一度も取れていない
          kept: normViewersRef.current.length,
        });
      }
    };

    // 初期化処理（Goals / doneruAmount を取得）
    const fetchInitialData = async () => {
      try {
        // 2. Goals を取得（id 固定: 2025-10-24）
        const goalsResponse = await getById<GoalRecord>("Goals", GOAL_ID);
        if (!goalsResponse.ok) {
          throw new Error("Failed to fetch Goals");
        }
        const goalRecord = goalsResponse.data;
        sendLog("AlertBox", sessionId, "fetchGoalsSuccess", { goalRecord });

        // 3. doneruAmount を取得
        const doneruAmount = await getDoneruAmount(goalRecord.doneruGoalKey);
        sendLog("AlertBox", sessionId, "fetchDoneruAmountSuccess", {
          doneruAmount,
        });

        // currentAmount を算出して goal state にセット
        const currentAmount =
          goalRecord.startAmount + goalRecord.superChatAmount + doneruAmount;
        setGoal({
          ...goalRecord,
          currentAmount,
        });
        sendLog("AlertBox", sessionId, "initSuccess", {
          currentAmount,
          goal: goalRecord,
        });
      } catch (error) {
        /* **貯金箱が出せないだけ。** 通知そのものは別の口から来るので、
           ここで画面を差し替えない（前は差し替えていたので、この口が
           落ちた晩は投げ銭が来てもお礼が1つも出なかった）。 */
        sendLog("AlertBox", sessionId, "initError", { error });
        setDead("init");
      }
    };
    fetchCharacters();
    fetchInitialData();

    // Initialize connectors based on URL parameter
    const cleanupFunctions: (() => void)[] = [];

    const handleNotification = (notification: NotificationData) => {
      // Check if notification type is in accepted types and enabled
      if (
        !NOTIFICATION_TYPES.includes(notification.type) ||
        settings[notification.type].enable !== 1
      ) {
        sendLog("AlertBox", sessionId, "notificationDisabled", notification);
        return;
      }

      // donation / superchat の場合、ローカル currentAmount を更新
      if (
        notification.type === "donation" ||
        notification.type === "superchat"
      ) {
        setGoal((prev) => {
          if (!prev) return prev;

          let amountToAdd = 0;
          if (notification.type === "donation") {
            amountToAdd = notification.amount;
          } else if (notification.type === "superchat") {
            amountToAdd = Math.floor(
              notification.jpy * SUPERCHAT_CONVERSION_RATE
            );
          }

          return {
            ...prev,
            currentAmount: prev.currentAmount + amountToAdd,
          };
        });

        sendLog("AlertBox", sessionId, "currentAmountUpdated", {
          type: notification.type,
          amount:
            notification.type === "donation"
              ? notification.amount
              : Math.floor(notification.jpy * SUPERCHAT_CONVERSION_RATE),
        });
      }

      // superchat の場合のみ SuperChats に INSERT
      if (notification.type === "superchat" && !notification.test) {
        const superChatRecord: SuperChatRecord = {
          id: notification.id || `unknown-${new Date().getTime()}`,
          amount: notification.amount,
          currency: notification.currency,
          jpy: notification.jpy,
          message: notification.message,
          nickname: notification.nickname,
          test: notification.test,
          type: notification.type,
        };

        // INSERT は非同期で実行し、失敗してもキュー追加は続行
        insert("SuperChats", superChatRecord)
          .then(() => {
            sendLog("AlertBox", sessionId, "superChatInsertSuccess", {
              id: notification.id,
            });
          })
          .catch((error) => {
            sendLog("AlertBox", sessionId, "superChatInsertError", {
              id: notification.id,
              error,
            });
          });
      }

      // Add to queue
      sendLog("AlertBox", sessionId, "notificationReceived", notification);

      /* **当たらなかったことを1行残す。**
         当たらなくても画面には何も出ない（配信に映るので既定の絵に
         落ちるだけ）。なので、あやとから見えるのは「あの人のキャラクターが
         出なくなった」だけで、原因の見当がつかない。次に起きたとき、
         ここ1行で **名簿が0人（取り直しがこけた）** なのか
         **名簿は居るのに字が違う** のかが分かれる。
         **生の名前は足さない。** すぐ上の `notificationReceived` が通知
         まるごとを出しているので、増やす理由がない（`island-misses.md` #96）。 */
      const roster = normViewersRef.current;
      if (!matchViewerByNickname(roster, notification.nickname)) {
        sendLog("AlertBox", sessionId, "viewerNotMatched", {
          // 何人の名簿に当てにいって当たらなかったのか（分母。`island-standards.md` §15）
          roster: roster.length,
          /* 0人なら、当たらないのは名前のせいではない。
             取り直しが一度も通っていない、ということ */
          rosterEmpty: roster.length === 0,
          ...describeNickname(notification.nickname),
        });
      }

      setNotificationQueue((prevQueue) => [...prevQueue, notification]);
    };

    const handleError = (error: Error) => {
      sendLog("AlertBox", sessionId, "connectorError", {
        error: error.message,
      });
    };

    /* 合言葉が無ければ、どちらのつなぎ先も持てない。**黙って止まらない。**
       前の形（環境変数に焼き込む）から替わったので、OBS の URL を
       貼り替えていないと必ずここに来る（#180）。
       **ただし配信の画面に手順を書かない。** 印だけ出して、
       何をすればよいかはログに残す。 */
    if (!/^[0-9a-f]{32}$/.test(alertboxId)) {
      sendLog("AlertBox", sessionId, "noAlertboxId");
      setDead("no-k");
      return () => {
        sendLog("AlertBox", sessionId, "unmount");
      };
    }

    /* 名簿を、ときどき取り直す（合言葉があるときだけ。無ければ口が
       404 を返すので、叩いても意味がない）。
       **こけても今の名簿は捨てない** — `fetchCharacters` は取れたときしか
       差し替えない作りにしてある。 */
    const charactersTimer = setInterval(fetchCharacters, CHARACTERS_REFRESH_MS);
    cleanupFunctions.push(() => clearInterval(charactersTimer));

    // Initialize Doneru connector if enabled
    if (enabledSources.includes("doneru")) {
      /* **つなぎ先はサーバーに聞く。** 鍵を書き出しに焼くのをやめたので、
         ここで初めて分かる。聞けるまでは繋がない。 */
      let stopped = false;
      let inner: (() => void) | null = null;
      getAlertboxWss(alertboxId)
        .then((wss) => {
          if (stopped) return;
          const doneruConnector = new DoneruConnector(wss);
          inner = doneruConnector.start(handleNotification, handleError);
          sendLog("AlertBox", sessionId, "doneruConnectorStarted");
        })
        .catch((e) => {
          sendLog("AlertBox", sessionId, "doneruWssError", {
            error: String(e),
          });
          /* **原因は2つあるが、口はどちらも 404 を返す。** 合言葉が
             当たったことだけを外から確かめられないようにするため。
             どちらなのかは画面では分けられないし、分けたところで
             配信に映してよい話ではない。印だけ出して、詳しくはログに残す
             （実際 2026-09-09 に止まったのは鍵のほうだった）。 */
          setDead("wss");
        });
      cleanupFunctions.push(() => {
        stopped = true;
        inner?.();
      });
    }

    // Initialize YouTube connector if enabled
    if (enabledSources.includes("youtube")) {
      const youtubeConnector = new YouTubeConnector(alertboxId);
      const cleanup = youtubeConnector.start(handleNotification, handleError);
      cleanupFunctions.push(cleanup);
      sendLog("AlertBox", sessionId, "youtubeConnectorStarted");
    }

    // 通知画像のプリフェッチ（体感を滑らかに）
    Promise.all(NOTIFICATION_TYPES.map((v) => Image.prefetch(imageUrl(v))));

    // アンマウント時のクリーンアップ
    return () => {
      // Stop all connectors
      cleanupFunctions.forEach((cleanup) => cleanup());
      // 画面離脱ログ
      sendLog("AlertBox", sessionId, "unmount");
    };
  }, [enabledSources, alertboxId]);

  /**
   * 金額に応じてアラート時間を調整
   * donation/superchat のみ延長対象
   * - 10,000 以上: +30 秒
   * - 1,000 以上: +15 秒
   */
  const calculateAdjustedAlertDuration = (
    notification: NotificationData
  ): number => {
    const baseDuration = settings[notification.type]?.alertDuration || 3;

    // donation と superchat のみ金額による延長を適用
    if (notification.type === "donation" || notification.type === "superchat") {
      const amount = notification.amount || 0;

      if (amount >= 10000) {
        return baseDuration + 30; // +30秒
      } else if (amount >= 1000) {
        return baseDuration + 15; // +15秒
      }
    }

    return baseDuration; // 元の時間
  };

  // 視聴者ニックネームから表示用の視聴者情報（絵文字/アイコン）を検索
  const matchedViewer = useCallback(
    (notification: NotificationData | null) => {
      return notification
        ? matchViewerByNickname(normViewers, notification.nickname)
        : null;
    },
    [normViewers]
  );

  // エフェクト用絵文字
  const emoji = useMemo(() => {
    const viewer = matchedViewer(notification);
    return viewer?.emoji || null;
  }, [matchedViewer, notification]);

  /* 視聴者のキャラクターの絵（当たった人だけ差し替える）。
     **URL は名簿がそのまま持っている。** 前はドライブの画像IDから
     `lh3.googleusercontent.com/d/…` を組み立てていたが、絵は置き場へ
     移したので（#284）、組み立てる相手がもういない。 */
  const iconUrl = useCallback(
    (n: NotificationData | null) => (n ? matchedViewer(n)?.iconUrl ?? null : null),
    [matchedViewer]
  );

  /* 一度温めた動画の URL。**名簿は10分ごとに取り直す**ので、これが無いと
     同じ動画を配信4時間で24回落とすことになる。
     しくじった（`error`）ぶんだけ外して、次の取り直しでもう一度試す。 */
  const warmedVideosRef = useRef<Set<string>>(new Set());

  const preloadVideo = useCallback((url: string) => {
    if (Platform.OS !== "web") return;
    // 同じ URL は二度落とさない（取り直しのたびに温め直さない）
    if (warmedVideosRef.current.has(url)) return;
    warmedVideosRef.current.add(url);

    const video = document.createElement("video");
    let settled = false;

    const finish = (ok: boolean, reason: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);

      video.onloadeddata = null;
      video.oncanplay = null;
      video.onerror = null;

      /* 取れなかったものだけ、次の取り直しでもう一度試せるようにする。
         `timeout` は「こちらが見るのをやめた」だけで、落とすのは
         ブラウザが続けているので、外さない。 */
      if (reason === "error") warmedVideosRef.current.delete(url);

      sendLog("AlertBox", sessionId, "videoPreloadFinished", {
        url,
        ok,
        reason,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    const timer = window.setTimeout(() => {
      finish(false, "timeout");
    }, VIDEO_START_TIMEOUT_MS);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    sendLog("AlertBox", sessionId, "videoPreloadStart", { url });

    video.onloadeddata = () => finish(true, "loadeddata");
    video.oncanplay = () => finish(true, "canplay");
    video.onerror = () => finish(false, "error");

    video.load();
  }, []);

  /* **名簿が来た時点で温める。** アラートが出る瞬間に温め始めても間に合わない
     （届くまで `<video>` が ▶ の板を出す。Android で実際にそう見えていた）。
     名簿は起動直後に来るので、最初の投げ銭までに何分もある。
     動画を持っているのは 101 人中1人なので、落とすのは1本。
     取り直しのたびに温め直さないのは `warmedVideosRef` が見ている。 */
  useEffect(() => {
    // `still=1` の日は動画を出さないので、**1バイトも落とさない**
    if (stillOnly) return;
    for (const url of new Set(
      normViewers.map((v) => v.videoUrl).filter((u): u is string => !!u)
    )) {
      preloadVideo(url);
    }
  }, [normViewers, preloadVideo, stillOnly]);

  useEffect(() => {
    // 表示中の通知がない場合のみ、次の通知を処理開始
    if (!notification && notificationQueue.length > 0) {
      processNotificationQueue();
    }
  }, [notificationQueue, notification]);

  // 通知キューの先頭を取り出して表示→一定時間後に非表示→キューから削除
  const processNotificationQueue = useCallback(async () => {
    if (notificationQueue.length === 0) return;

    const currentNotification = notificationQueue[0];
    // 表示ログ
    sendLog(
      "AlertBox",
      sessionId,
      "notificationDisplayed",
      currentNotification
    );

    /* 表示ソースを決定（画像/動画）し、表示前に preload。
       **ここで投げさせない。** 投げると下の `setNotification` に届かず、
       アラートが出ないままキューの先頭も減らない。そのあとの投げ銭が
       全部そこで詰まって、**配信のあいだアラートが二度と出なくなる。**
       `calculateAdjustedSource` の中は投げないようにしてあるが、
       ここでも受けておく（絵は飾りで、アラートの前提ではない）。 */
    let source: { type: "image" | "video"; url: string | null } = {
      type: "image",
      url: imageUrl(currentNotification.type),
    };
    try {
      source = await calculateAdjustedSource(currentNotification);
    } catch (error) {
      sendLog("AlertBox", sessionId, "sourceError", { error: String(error) });
    }
    showSource(source);

    // 表示開始（フェードイン）
    setNotification(currentNotification);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // 読み上げ（設定が有効な donation/superchat のみ）
    if (
      currentNotification.type === "donation" ||
      currentNotification.type === "superchat"
    )
      if (settings[currentNotification.type]?.tts.enable === 1)
        speak(currentNotification.message, (e) =>
          sendLog("AlertBox", sessionId, "ttsError", { message: e.message })
        );

    // 金額に応じて調整された表示時間
    const adjustedAlertDuration =
      calculateAdjustedAlertDuration(currentNotification);

    // 指定時間後にフェードアウト→完了後に通知をクリア＆キュー先頭を削除
    setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        setNotification(null);
        setNotificationQueue((prevQueue) => prevQueue.slice(1)); // キューから通知を削除
      }, 500);
    }, adjustedAlertDuration * 1000);
  }, [notificationQueue, opacity, showSource]);

  // テンプレート本文（通知タイプに紐づくテンプレートを取得）
  const mainTextTemplate = useMemo(
    () => (notification ? settings[notification.type].messageTemplate : ""),
    [notification]
  );

  // 通知タイプごとの画像 URL を生成
  const imageUrl = useCallback(
    (notificationType: NotificationData["type"] | null) =>
      notificationType
        ? `https://d1ewxqdha2zjcd.cloudfront.net/assets/images/${settings[notificationType].imageSource.hash}`
        : "",
    []
  );

  /**
   * 温めておく。**取れなくても投げない。**
   *
   * `Image.prefetch` は 404 や電波切れで reject する。ここで投げると
   * 呼んだ側（`processNotificationQueue`）が `setNotification` まで
   * 辿り着かず、**アラートが1つも出ないまま、キューの先頭も減らない。**
   * そのあとの投げ銭も全部そこで詰まる。**配信中に、あやとが直せない。**
   *
   * 絵が1枚取れないのは「絵が出ない」で済ませてよい話で、
   * 「アラートが止まる」にしてよい話ではない。
   */
  const warm = useCallback(async (url: string | null): Promise<boolean> => {
    if (!url) return false;
    try {
      await Image.prefetch(url);
      return true;
    } catch (error) {
      sendLog("AlertBox", sessionId, "imagePrefetchFailed", {
        error: String(error),
      });
      return false;
    }
  }, []);

  async function calculateAdjustedSource(
    n: NotificationData
  ): Promise<{ type: "image" | "video"; url: string | null }> {
    const viewer = matchedViewer(n);
    const fallbackIconUrl = iconUrl(n);
    const fallbackImageUrl = imageUrl(n.type);

    if (
      (n.type === "donation" || n.type === "superchat") &&
      n.amount >= 0 &&
      viewer?.videoUrl &&
      Platform.OS === "web" &&
      // `still=1` の日は、動画を持っている人でも絵にする
      !stillOnly
    ) {
      // preload は事前ウォームアップだけにする
      preloadVideo(viewer.videoUrl);

      // フォールバック用画像も先に温めておく（待たない）
      warm(fallbackIconUrl ?? fallbackImageUrl);

      return { type: "video", url: viewer.videoUrl };
    }

    // その人の絵。取れなければ通知タイプごとの既定の絵に落とす
    if (await warm(fallbackIconUrl)) {
      return { type: "image", url: fallbackIconUrl };
    }

    /* 既定の絵まで取れないこともある（電波が切れている）。
       **それでも url を返す。** `<Image>` は出ないが、名前と金額と
       本文は出る。**何も出ないより、字だけでも出るほうがよい。** */
    await warm(fallbackImageUrl);
    return { type: "image", url: fallbackImageUrl };
  }

  const fallbackToImageSource = useCallback(async () => {
    if (!notification) return;

    const fallbackIconUrl = iconUrl(notification);
    if (await warm(fallbackIconUrl)) {
      showSource({ type: "image", url: fallbackIconUrl });
      return;
    }

    const fallbackImageUrl = imageUrl(notification.type);
    await warm(fallbackImageUrl);
    showSource({ type: "image", url: fallbackImageUrl });
  }, [iconUrl, imageUrl, notification, warm, showSource]);

  // play() の失敗を拾う useEffect
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (displaySource.type !== "video" || !displaySource.url) return;
    if (!videoRef.current) return;

    const el = videoRef.current;

    sendLog("AlertBox", sessionId, "videoPlayAttempt", {
      url: displaySource.url,
      readyState: el.readyState,
      networkState: el.networkState,
    });

    const playPromise = el.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => {
        sendLog("AlertBox", sessionId, "videoPlayRejected", {
          url: displaySource.url,
          message: error instanceof Error ? error.message : String(error),
          name:
            typeof error === "object" && error && "name" in error
              ? String((error as { name?: string }).name)
              : undefined,
        });
        fallbackToImageSource();
      });
    }
  }, [displaySource, fallbackToImageSource]);

  /* 動き出さないまま待たせない。
     `videoPlayRejected` も `videoError` も来ないのに、中身だけ届かない
     ことがある（電波が細い・置き場が遅い）。そのときは `<video>` が
     透明のまま黙って居座るので、**絵のまま止める。**
     ここで絵に落としても、アラートそのものは出たままで、次の通知も流れる
     （`processNotificationQueue` の外なので、キューには触らない）。 */
  useEffect(() => {
    if (displaySource.type !== "video" || !displaySource.url) return;
    if (videoStarted) return;

    const url = displaySource.url;
    const timer = setTimeout(() => {
      sendLog("AlertBox", sessionId, "videoStartTimeout", {
        url,
        waitedMs: VIDEO_START_TIMEOUT_MS,
      });
      fallbackToImageSource();
    }, VIDEO_START_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [displaySource, videoStarted, fallbackToImageSource]);

  // 金額に比例したエフェクト回数（花火/雨）を算出
  const effectCounts = useMemo(
    () =>
      notification?.type === "donation" || notification?.type === "superchat"
        ? {
            fireworksCount: Math.floor(notification.amount / 10000),
            rainsCount: Math.floor((notification.amount % 10000) / 100),
          }
        : null,
    [notification]
  );

  return (
    <>
      {/* 画面ヘッダーを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {/* 死んでいるときの印。**アラートの上に重ねるだけで、
            アラートを止めない**（口が1つ落ちても、生きている口から
            来た通知はそのまま出す） */}
        {dead && <DeadMark />}

        {notification && (
          <Animated.View style={[styles.alertBox, { opacity }]}>
            {/* 寄付（donation）とスーパーチャット（superchat）の統合表示 */}
            {(notification.type === "donation" ||
              notification.type === "superchat") && (
              <View style={styles.alertContainer}>
                {displaySource.type === "video" && displaySource.url ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    controls={false}
                    /* **ループする。** アラートは 30 秒出ているのに動画は
                       数秒しかない。止めると、残りは最後のコマの静止画。 */
                    loop
                    /* **音は付けない。** 音付きの自動再生はブラウザが
                       止めるので、外すと再生そのものが始まらない。 */
                    muted
                    playsInline
                    preload="auto"
                    src={displaySource.url}
                    /* **動き出すまで透明。** 中身が届く前の `<video>` は、
                       Android の WebView が ▶ の板を画面いっぱいに描く。
                       あやとが撮った絵がそれ。透明にしておけば、下に置いた
                       その人の絵がそのまま見えている。 */
                    style={{ ...styles.image, opacity: videoStarted ? 1 : 0 }}
                    onLoadStart={() =>
                      sendLog("AlertBox", sessionId, "videoLoadStart", {
                        url: displaySource.url,
                      })
                    }
                    onLoadedMetadata={(e) =>
                      sendLog("AlertBox", sessionId, "videoLoadedMetadata", {
                        url: displaySource.url,
                        duration: e.currentTarget.duration,
                        readyState: e.currentTarget.readyState,
                        networkState: e.currentTarget.networkState,
                      })
                    }
                    onCanPlay={(e) =>
                      sendLog("AlertBox", sessionId, "videoCanPlay", {
                        url: displaySource.url,
                        readyState: e.currentTarget.readyState,
                        networkState: e.currentTarget.networkState,
                      })
                    }
                    /* **ここで初めて見せる。** `canplay` ではない。
                       `canplay` は「そろそろ出せる」でまだ止まっており、
                       自動再生が許されるかの返事も来ていない。`playing` は
                       再生が始まった合図で、コマが1枚できている。
                       `videoCanPlay` と `videoPlaying` の両方をログに
                       残してあるので、差は本番のログで測れる。 */
                    onPlaying={() => {
                      setVideoStarted(true);
                      sendLog("AlertBox", sessionId, "videoPlaying", {
                        url: displaySource.url,
                      });
                    }}
                    onError={(e) => {
                      const mediaError = e.currentTarget.error;
                      sendLog("AlertBox", sessionId, "videoError", {
                        url: displaySource.url,
                        code: mediaError?.code,
                        message: mediaError?.message,
                        readyState: e.currentTarget.readyState,
                        networkState: e.currentTarget.networkState,
                      });
                      fallbackToImageSource();
                    }}
                  />
                ) : (
                  <Image
                    resizeMode="contain"
                    style={{ ...styles.image }}
                    source={{
                      uri: displaySource.url || imageUrl(notification.type),
                    }}
                  />
                )}

                {/* 動画が動き出すまでの地。**その人の絵**を、透明な
                    `<video>` の上に重ねて出す（既定のアラート画像では
                    ない）。動き出したら消す。その人の絵まで無ければ、
                    通知タイプごとの既定の絵に落ちる。
                    **絵だけの人はここを通らない。** */}
                {displaySource.type === "video" &&
                  !!displaySource.url &&
                  !videoStarted && (
                    <Image
                      resizeMode="contain"
                      style={{ ...styles.image }}
                      source={{
                        uri:
                          iconUrl(notification) || imageUrl(notification.type),
                      }}
                    />
                  )}

                {/* 視聴者に絵文字設定がある場合の花火エフェクト */}
                {emoji && (
                  <FireworkDisplay
                    style={styles.fireworkExplosion}
                    emoji={emoji}
                    count={effectCounts?.fireworksCount || 0}
                    alertDuration={calculateAdjustedAlertDuration(notification)}
                  />
                )}

                {/* 視聴者に絵文字設定がある場合の雨エフェクト */}
                {emoji &&
                  Array.from({ length: effectCounts?.rainsCount || 0 }).map(
                    (_, i) => (
                      <RainEffect
                        key={i}
                        index={i}
                        emoji={emoji}
                        // 表示時間全体に均等配置（最初と最後を少し余白）
                        delay={
                          ((calculateAdjustedAlertDuration(notification) *
                            1000 -
                            2000) /
                            (effectCounts?.rainsCount || 1)) *
                          i
                        }
                      />
                    )
                  )}

                {/* テキスト部（テンプレートの {名前} / {金額} / {単位} を置換） */}
                <View style={styles.textContainer}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === "{名前}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.nickname}
                          </Text>
                        );
                      } else if (part === "{金額}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.amount.toLocaleString()}
                          </Text>
                        );
                      } else if (part === "{単位}") {
                        // Handle currency unit - donation uses JPY, superchat uses its currency
                        const currency =
                          notification.type === "superchat"
                            ? notification.currency
                            : "円";
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {currency}
                          </Text>
                        );
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>

                  {/* メッセージ本文（寄付/スパチャ時のコメント） */}
                  <Text style={{ ...styles.message, ...messageStyle }}>
                    {notification.message}
                  </Text>
                </View>
              </View>
            )}

            {/* 新規チャンネル登録（YouTube Subscriber）用の表示 */}
            {notification.type === "youtubeSubscriber" && (
              <View style={{ ...styles.alertContainer, flexDirection: "row" }}>
                {/* 左側スペーサー */}
                <View style={{ height: "30%", width: "20%" }}></View>

                {/* 固定画像（YouTube 購読のアイコン） */}
                <Image
                  resizeMode="contain"
                  style={{ height: "30%", width: "30%" }}
                  source={{ uri: imageUrl(notification.type) }}
                />

                <View style={{ width: "40%" }}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === "{名前}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.nickname}
                          </Text>
                        );
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>
                </View>
              </View>
            )}

            {/* membership は未使用。必要になれば上記と同様の方針で実装 */}
            {/* {notification.type === 'membership' && (
              <View>
                <Text>{`New Membership from ${notification.nickname} at level: ${notification.level}`}</Text>
                <Text style={styles.message}>{getMessage()}</Text>
                <Image style={styles.image} source={{ uri: getImageUrl() }} />
              </View>
            )} */}
          </Animated.View>
        )}

        {/* 豚の貯金箱ゲージ（アラート非表示時のみ） */}
        {!notification && goal && (
          <View style={styles.piggyGaugeContainer}>
            <PiggyGauge
              currentAmount={goal.currentAmount}
              targetAmount={goal.targetAmount}
              label={goal.label}
            />
          </View>
        )}
      </View>
    </>
  );
}
