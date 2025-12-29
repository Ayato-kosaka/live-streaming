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
const KEY_VISUAL_URL =
  "https://d1ewxqdha2zjcd.cloudfront.net/assets/images/2b8554b15282b1xnx11m5ikor9y.png";

// 目標金額（円）
const TARGET_AMOUNT = 50000;

// スクロール時間（秒）
const SCROLL_DURATION = 30;

// 画面の幅
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 4列グリッド
const NUM_COLUMNS = 4;

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
      <Text style={styles.itemNickname} numberOfLines={1} ellipsizeMode="tail">
        {item.nickname}
      </Text>
      <Text style={styles.itemAmount}>{item.amount.toLocaleString()}円</Text>
      {item.message && (
        <Text style={styles.itemMessage} numberOfLines={2} ellipsizeMode="tail">
          {item.message}
        </Text>
      )}
    </View>
  );
};

export default function CreditsPage() {
  const [donationItems, setDonationItems] = useState<DonationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(new Date().getTime());

  // スクロールアニメーション用
  const translateY = useRef(new Animated.Value(0)).current;

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
        // TODO: 実際のAPIエンドポイントに変更が必要
        // process.env.EXPO_PUBLIC_NOTIFICATIONS_API_URL などを使用
        let allNotifications: DonationNotification[] = [];

        try {
          // 通知履歴APIから取得を試みる
          // 本番環境では適切なエンドポイントURLに変更してください
          const notificationsUrl =
            process.env.EXPO_PUBLIC_NOTIFICATIONS_API_URL ||
            process.env.EXPO_PUBLIC_GAS_API_URL;

          if (notificationsUrl) {
            const notificationsResponse = await fetch(notificationsUrl);
            const notificationsData = await notificationsResponse.json();

            // 通知データの配列を取得（実際のAPI構造に応じて調整）
            allNotifications =
              notificationsData.notifications ||
              notificationsData.data ||
              notificationsData ||
              [];
          } else {
            // テストデータを使用（開発用）
            sendLog(
              "CreditsPage",
              sessionId,
              "usingTestData",
              "No notifications API URL configured, using mock data"
            );
            // モックデータ（開発・デモ用）
            allNotifications = Array.from({ length: 20 }, (_, i) => ({
              type: "donation" as const,
              amount: 1000 + i * 500,
              nickname: `寄付者${i + 1}`,
              message: `応援メッセージ${i + 1}です！いつも配信ありがとうございます。`,
              messageType: 1,
              assetID: null,
              test: true,
            }));
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
        const donations = allNotifications
          .filter((n) => n.type === "donation")
          .sort((a, b) => {
            // タイムスタンプがある場合はそれでソート、なければ順序維持
            return 0;
          });

        // 4. 合計50,000円到達までスライス
        let total = 0;
        const selectedDonations: DonationNotification[] = [];
        for (const d of donations) {
          if (total >= TARGET_AMOUNT) break;
          selectedDonations.push(d);
          total += d.amount;
        }

        sendLog("CreditsPage", sessionId, "selectedDonations", {
          count: selectedDonations.length,
          total,
        });

        // 5. 表示用アイテムを作成
        const items: DonationItem[] = selectedDonations.map((d) => {
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
        const itemHeight = 180; // styles.itemContainer の高さ
        const totalHeight = numRows * itemHeight;

        // 下から上へスクロール：0 → -totalHeight
        Animated.timing(translateY, {
          toValue: -totalHeight,
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
    backgroundColor: "#000000",
    justifyContent: "center",
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
    height: 180,
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
    color: "#ffffff",
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
    color: "#cccccc",
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
