// Donation Credits Roll Page
// - 投げ銭合計5万円到達までの寄付者をエンドロール形式で表示
// - 9:16 縦長レイアウト、上部に1:1キービジュアル固定
// - 下部で4列グリッド、下→上へ約30秒スクロール
// - 画像prefetch完了後に描画開始（チカチカしない）
// - エフェクトなし（花火・雨・TTS・点滅・パルス等なし）

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Animated,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Stack } from "expo-router";
import { DonationNotification, Viewer } from "@/app/alertbox/types";
import { sendLog } from "@/lib/log";
import {
  matchViewerByNickname,
  normalizeName,
  normalizeNameNoEmoji,
} from "@/app/alertbox/matching.utils";

// 1:1 キービジュアル画像URL（既存で生成済み）
const KEY_VISUAL_URL = "https://i.ibb.co/rfM65PJh/IMG-3896.jpg";

// 目標金額（円）
const TARGET_AMOUNT = 50000;

// スクロール時間（秒）
const SCROLL_DURATION = 90;

// 画面の幅
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 4列グリッド
const NUM_COLUMNS = 3;

// アイテムの高さ（styles.itemContainerと一致）
const ITEM_HEIGHT = 60;

const { height } = Dimensions.get("window");

interface DonationItem {
  nickname: string;
  amount: number;
  message: string;
  iconUri: string | null;
}

// 寄付アイテムコンポーネント（アイコン + 名前 + 金額 + メッセージ）
const DonationCreditsItem: React.FC<{ item: DonationItem }> = ({ item }) => {
  return (
    <View style={styles.itemContainer}>
      <Image
        source={{
          uri:
            item.iconUri ||
            "https://d1ewxqdha2zjcd.cloudfront.net/assets/images/2b8554b15282b1xnx11m5ikor9y.png",
        }}
        style={styles.itemIcon}
        resizeMode="cover"
      />
      <View style={{ position: "absolute" }}>
        <Text
          style={styles.itemNickname}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.nickname}
        </Text>
        <Text style={styles.itemAmount}>{item.amount.toLocaleString()}円</Text>
        {item.message && (
          <Text
            style={styles.itemMessage}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.message}
          </Text>
        )}
      </View>
    </View>
  );
};

export default function CreditsPage() {
  const [donationItems, setDonationItems] = useState<DonationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(new Date().getTime());

  // スクロールアニメーション用
  const translateY = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    sendLog("CreditsPage", sessionId, "mount");

    const fetchAndProcessData = async () => {
      try {
        // 1. 視聴者情報を取得
        let normViewers: (Viewer & {
          norm: string;
          normNoEmoji: string;
        })[] = [];

        try {
          if (process.env.EXPO_PUBLIC_GAS_API_URL) {
            const viewersResponse = await fetch(
              process.env.EXPO_PUBLIC_GAS_API_URL
            );
            const viewersData = await viewersResponse.json();
            normViewers = (viewersData.viewers ?? []).map((v: Viewer) => ({
              ...v,
              norm: normalizeName(v.name),
              normNoEmoji: normalizeNameNoEmoji(v.name),
            }));

            sendLog("CreditsPage", sessionId, "fetchViewersSuccess", {
              count: normViewers.length,
            });
          } else {
            sendLog(
              "CreditsPage",
              sessionId,
              "noViewersApi",
              "EXPO_PUBLIC_GAS_API_URL not configured"
            );
          }
        } catch (err) {
          sendLog("CreditsPage", sessionId, "fetchViewersError", {
            error: err instanceof Error ? err.message : String(err),
          });
          // エラーでも続行（空配列で）
        }

        // 2. 通知データを取得
        let allNotifications: DonationNotification[] = [];

        try {
          // 通知履歴APIから取得を試みる
          // 本番環境では適切なエンドポイントURLに変更してください
          const notificationsUrl =
            "https://storage.googleapis.com/live-streaming-d3cac-public/credits_notifications.json?nocache=" +
            Date.now();

          if (notificationsUrl) {
            const notificationsResponse = await fetch(notificationsUrl);
            const notificationsData = await notificationsResponse.json();

            // 通知データの配列を取得（実際のAPI構造に応じて調整）
            allNotifications = notificationsData || [];
          } else {
          }
        } catch (err) {
          sendLog("CreditsPage", sessionId, "fetchNotificationsError", {
            error: err instanceof Error ? err.message : String(err),
          });
          // エラーでも続行（テストデータまたは空配列で）
          allNotifications = [];
        }

        sendLog("CreditsPage", sessionId, "fetchNotificationsSuccess", {
          count: allNotifications.length,
        });

        // データが空の場合の警告
        if (allNotifications.length === 0) {
          sendLog(
            "CreditsPage",
            sessionId,
            "noNotifications",
            "No notifications available. Configure EXPO_PUBLIC_NOTIFICATIONS_API_URL or provide test data."
          );
        }

        // 3. donation のみ抽出し、時系列順にソート
        // 注: DonationNotification型にはタイムスタンプフィールドがないため、
        // APIから受信した順序をそのまま時系列とみなす（配列の順序を維持）
        const donations = allNotifications.filter((n) => n.type === "donation");

        // 5. 表示用アイテムを作成
        const items: DonationItem[] = donations.map((d) => {
          const matchedViewer = matchViewerByNickname(
            normViewers,
            d.nickname
          ) as (typeof normViewers)[0] | null;

          const iconUri = matchedViewer?.icon
            ? `https://lh3.googleusercontent.com/d/${matchedViewer.icon}`
            : null;

          return {
            nickname: d.nickname,
            amount: d.amount,
            message: d.message || "",
            iconUri,
          };
        });

        // 6. 全アイコン画像をprefetch
        const iconUris = items
          .map((item) => item.iconUri)
          .filter((uri): uri is string => uri !== null);

        // キービジュアルもprefetch
        const allUris = [KEY_VISUAL_URL, ...iconUris];

        sendLog("CreditsPage", sessionId, "prefetchingImages", {
          count: allUris.length,
        });

        await Promise.all(
          allUris.map((uri) =>
            Image.prefetch(uri).catch((e) => {
              sendLog("CreditsPage", sessionId, "prefetchError", {
                uri,
                error: e.message,
              });
              // エラーでも続行
              return Promise.resolve(false);
            })
          )
        );

        sendLog("CreditsPage", sessionId, "prefetchComplete");

        // 7. 描画開始
        setDonationItems(items);
        setIsLoading(false);

        // 8. スクロールアニメーション開始
        // リストの高さを計算（アイテム数 / 列数 * アイテム高さ）
        const numRows = Math.ceil(items.length / NUM_COLUMNS);
        const totalHeight = numRows * (ITEM_HEIGHT + 1);

        // 下から上へスクロール：0 → -totalHeight
        Animated.timing(translateY, {
          toValue: -totalHeight - 1000,
          duration: SCROLL_DURATION * 1000,
          useNativeDriver: true,
        }).start(() => {
          sendLog("CreditsPage", sessionId, "scrollComplete");
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        sendLog("CreditsPage", sessionId, "error", { error: errorMessage });
        setError("データの取得に失敗しました");
        setIsLoading(false);
      }
    };

    fetchAndProcessData();

    return () => {
      sendLog("CreditsPage", sessionId, "unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#37a9fd" />
        <Text style={styles.loadingText}>画像を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {/* キービジュアル（1:1）固定表示 */}
        <View style={styles.keyVisualContainer}>
          <Image
            source={{ uri: KEY_VISUAL_URL }}
            style={styles.keyVisual}
            resizeMode="contain"
          />
        </View>

        {/* 寄付者リスト（4列グリッド、下→上スクロール） */}
        <View style={styles.creditsContainer}>
          <Animated.View
            style={[
              styles.creditsContent,
              {
                transform: [{ translateY }],
              },
            ]}
          >
            <FlatList
              data={donationItems}
              renderItem={({ item }) => <DonationCreditsItem item={item} />}
              keyExtractor={(item, index) => `${item.nickname}-${index}`}
              numColumns={NUM_COLUMNS}
              scrollEnabled={false}
              columnWrapperStyle={styles.columnWrapper}
            />
          </Animated.View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fcf4e7",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  keyVisualContainer: {
    width: SCREEN_WIDTH,
    aspectRatio: 1, // 1:1
    justifyContent: "center",
    alignItems: "center",
  },
  keyVisual: {
    width: "100%",
    height: "100%",
  },
  creditsContainer: {
    flex: 1,
    position: "absolute",
    width: SCREEN_WIDTH,
    overflow: "hidden",
  },
  creditsContent: {
    width: "100%",
  },
  columnWrapper: {
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  itemContainer: {
    width: SCREEN_WIDTH / NUM_COLUMNS - 16,
    height: ITEM_HEIGHT,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  itemIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 4,
  },
  itemNickname: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#633a3a",
    textAlign: "center",
    marginBottom: 2,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#37a9fd",
    textAlign: "center",
    marginBottom: 4,
  },
  itemMessage: {
    fontSize: 10,
    color: "#633a3a",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#ffffff",
  },
  errorText: {
    fontSize: 16,
    color: "#ff0000",
  },
});
