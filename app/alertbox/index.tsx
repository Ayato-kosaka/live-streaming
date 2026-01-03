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
import { View, Text, Animated, Image, TextStyle } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { settings } from "./config";
import { styles } from "./styles";
import { FireworkDisplay, RainEffect } from "./components";
import {
  NotificationData,
  Viewer,
  GoalState,
  SuperChatRecord,
  GoalRecord,
} from "./types";
import { PiggyGauge } from "./components/PiggyGauge";
import { sendLog } from "@/lib/log";
import {
  matchViewerByNickname,
  normalizeName,
  normalizeNameNoEmoji,
} from "./matching.utils";
import { speak } from "./tts.utils";
import { getMainTextStyle, getSubMessageStyle } from "./styles.utils";
import { DoneruConnector, YouTubeConnector } from "./connectors";
import { getTable, getById, insert, getDoneruAmount } from "./api.utils";

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

export default function AlertBox() {
  // Parse URL parameters for source selection
  const params = useLocalSearchParams<{ source?: string }>();

  // 視聴者情報（名前の正規化済み）
  const [normViewers, setNormViewers] = useState<
    (Viewer & { norm: string; normNoEmoji: string })[]
  >([]);

  // Goals 情報（起動時に取得し currentAmount を算出して保持）
  const [goal, setGoal] = useState<GoalState | null>(null);

  // 現在表示中の通知（なければ null）
  const [notification, setNotification] = useState<NotificationData | null>(
    null
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

  // エラーメッセージ
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    // 画面起動ログ
    sendLog("AlertBox", sessionId, "mount", { enabledSources });

    // 初期化処理（Viewers / Goals / doneruAmount を取得）
    const fetchInitialData = async () => {
      try {
        // 1. Viewers を取得
        const viewersResponse = await getTable<Viewer[]>("Viewers");
        if (!viewersResponse.ok) {
          throw new Error("Failed to fetch Viewers");
        }
        const viewers = viewersResponse.data || [];
        const normViewers = viewers.map((v: Viewer) => ({
          ...v,
          norm: normalizeName(v.name),
          normNoEmoji: normalizeNameNoEmoji(v.name),
        }));
        setNormViewers(normViewers);
        sendLog("AlertBox", sessionId, "fetchViewersSuccess", {
          viewers,
          normViewers,
        });

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
        // 失敗ログ
        sendLog("AlertBox", sessionId, "initError", { error });
        setError(
          "初期化に失敗しました。Viewers / Goals / doneruAmount の取得を確認してください。"
        );
      }
    };
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
      if (notification.type === "superchat") {
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
      setNotificationQueue((prevQueue) => [...prevQueue, notification]);
    };

    const handleError = (error: Error) => {
      sendLog("AlertBox", sessionId, "connectorError", {
        error: error.message,
      });
    };

    // Initialize Doneru connector if enabled
    if (enabledSources.includes("doneru")) {
      const doneruConnector = new DoneruConnector(
        process.env.EXPO_PUBLIC_DONERU_WSS_URL!
      );
      const cleanup = doneruConnector.start(handleNotification, handleError);
      cleanupFunctions.push(cleanup);
      sendLog("AlertBox", sessionId, "doneruConnectorStarted");
    }

    // Initialize YouTube connector if enabled
    if (enabledSources.includes("youtube")) {
      const youtubeConnector = new YouTubeConnector();
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
  }, [enabledSources]);

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
        ? (matchViewerByNickname(
            normViewers,
            notification.nickname
          ) as (typeof normViewers)[0])
        : null;
    },
    [normViewers]
  );

  // エフェクト用絵文字
  const emoji = useMemo(() => {
    const viewer = matchedViewer(notification);
    return viewer?.Emoji || null;
  }, [matchedViewer, notification]);

  // 視聴者のカスタムアイコン URL（存在する場合のみ差し替え）
  const iconUrl = useCallback(
    (n: NotificationData | null) =>
      n && matchedViewer(n)?.Icon
        ? "https://lh3.googleusercontent.com/d/" + matchedViewer(n)?.Icon
        : null,
    [matchedViewer]
  );

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

    // 視聴者アイコンがあれば先にプリフェッチ
    iconUrl(currentNotification) &&
      (await Image.prefetch(iconUrl(currentNotification)!));

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
  }, [notificationQueue, iconUrl, opacity]);

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

  if (error) {
    return (
      <View style={styles.container}>
        <Text>{error}</Text>
      </View>
    );
  }

  return (
    <>
      {/* 画面ヘッダーを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {notification && (
          <Animated.View style={[styles.alertBox, { opacity }]}>
            {/* 寄付（donation）とスーパーチャット（superchat）の統合表示 */}
            {(notification.type === "donation" ||
              notification.type === "superchat") && (
              <View style={styles.alertContainer}>
                <Image
                  resizeMode="contain"
                  style={{ ...styles.image }}
                  source={{
                    uri: iconUrl(notification) || imageUrl(notification.type),
                  }}
                />

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
