import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Image,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import ViewShot from "react-native-view-shot";
import { AlertboxCharacter } from "./alertbox/types";
import { getAlertboxCharacters } from "./alertbox/api.utils";

/**
 * 他己紹介の画像を作る道具。
 *
 * 名簿は**スプレッドシートではなく島の口**から取る（#284）。
 * OBS の URL に載せているのと同じ 32桁の合言葉（`?k=`）が要る。
 * 開くときは `/ve-comment?k=…`。
 */
export default function App() {
  const [viewers, setViewers] = useState<AlertboxCharacter[]>([]);
  const [content, setContent] = useState("");
  const [messageInfos, setMessageInfos] = useState<MessageInfo[]>([]);

  /* 名簿の読みぐあい。**「まだ読んでいない」と「読めなかった」と
     「読めて0人だった」を、同じ絵にしない。**
     前は「0人なら画面ごと出さない」だったので、読めなかった日は
     入力欄ごと真っ白になって、**字が1つも出ないので理由が分からなかった。** */
  const [roster, setRoster] = useState<"wait" | "ok" | "down">("wait");

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitRef = useRef(5000);

  const loadViewers = useCallback(async () => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    try {
      // 合言葉は URL の `?k=`。OBS のアラートボックスと同じもの
      const k = new URLSearchParams(window.location.search).get("k") ?? "";
      setViewers(await getAlertboxCharacters(k));
      setRoster("ok");
      waitRef.current = 5000;
    } catch (error) {
      console.error("Error fetching characters:", error);
      setRoster("down");
      /* **押されるまで待たない。** 車の中から開いていることがあるので、
         電波が戻ったら黙って絵が出てくるようにする。間隔は倍にしていく */
      retryRef.current = setTimeout(loadViewers, waitRef.current);
      waitRef.current = Math.min(waitRef.current * 2, 60000);
    }
  }, []);

  useEffect(() => {
    loadViewers();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [loadViewers]);

  useEffect(() => {
    setMessageInfos(
      content.split("\n").map((line) => {
        const [author, message] = line.split("\t");
        return {
          author,
          message,
          authorImageUri: getIconUrl(author),
          viewShotRef: React.createRef<ViewShot>(),
        };
      })
    );
  }, [content]);

  const captureAndSaveAll = useCallback(async () => {
    for (const messageInfo of messageInfos) {
      // 逐次処理 で順番を保証
      await captureAndSave(messageInfo);
    }
  }, [messageInfos]);

  const captureAndSave = async (messageInfo: MessageInfo) => {
    const uri = (await messageInfo.viewShotRef.current?.capture?.()) || "";
    console.log(uri); // TODO 消す
    if (Platform.OS === "web") {
      // Web 用のダウンロード処理
      const link = document.createElement("a");
      link.href = uri;
      link.download = `${new Date().getTime()}-${messageInfo.message?.slice(
        0,
        10
      )}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // モバイル（iOS/Android）の場合、MediaLibrary を使用
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        await MediaLibrary.createAssetAsync(uri);
        alert("Image saved to gallery!");
      } else {
        alert("Permission denied to save image.");
      }
    }
  };

  /* 名前から絵を引く。1人が名前を何個も持つ（チャンネル名 + 他の呼び名）
     ので、どちらでも当たるようにする。絵は置き場に移した（#284）ので、
     口が返してくる URL をそのまま使う。 */
  const getIconUrl = useCallback(
    (name: string) => {
      const hit = viewers.find(
        (v) => v.channelName === name || v.aliases?.includes(name)
      );
      return hit?.plain?.sizes?.["256"] ?? hit?.plain?.full ?? undefined;
    },
    [viewers]
  );
  const getBackColorFromString = useCallback((s: string) => {
    const colors = [
      "#D50000",
      "#C51162",
      "#AA00FF",
      "#6200EA",
      "#304FFE",
      "#2962FF",
      "#0091EA",
      "#00B8D4",
      "#00BFA5",
      "#00C853",
      "#64DD17",
      "#AEEA00",
      "#FFD600",
      "#FFAB00",
      "#FF6D00",
      "#DD2C00",
      "#3E2723",
      "#212121",
      "#263238",
    ];
    const hash = s
      .split("")
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 2147483647, 0);
    return colors[hash % colors.length];
  }, []);

  /* **名簿が読めなくても、打てる。** 絵は名前から引いているだけで、
     コメントを組み立てるのに要るのは打った字だけ。
     ここで画面を返さない（前は `if (!viewers.length) return <View />`
     で真っ白になっていた）。 */
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.textArea}
        placeholder="Enter Content"
        value={content}
        onChangeText={setContent}
        multiline
      />

      {/* 読めなかったときだけ出す。**これから何が起きるか**だけを書く
          （なぜ読めなかったかは中の話なので書かない）。
          読み直しは黙って走っているので、待つだけでも戻る */}
      {roster === "down" && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            いま、キャラクターの絵を読みに行けませんでした。字だけで作れます。
          </Text>
          <Pressable style={styles.noticeButton} onPress={loadViewers}>
            <Text style={styles.noticeButtonText}>もう一度よみこむ</Text>
          </Pressable>
        </View>
      )}
      {messageInfos.map((messageInfo, i) => (
        <ViewShot
          key={i}
          ref={messageInfo.viewShotRef}
          style={styles.chatTextMessageRenderer}
          options={{ format: "png", quality: 1 }}
        >
          {messageInfo.authorImageUri ? (
            <Image
              style={styles.authorImage}
              source={{ uri: messageInfo.authorImageUri }}
            />
          ) : (
            <Text
              style={{
                ...styles.authorImage,
                backgroundColor: getBackColorFromString(messageInfo.author),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {messageInfo.author?.slice(0, 1)}
            </Text>
          )}
          <Text style={styles.message}>
            <Text style={styles.authorText}>{messageInfo.author} </Text>
            <Text>{messageInfo.message}</Text>
          </Text>
        </ViewShot>
      ))}
      <Button title="Save All" onPress={captureAndSaveAll} />
    </ScrollView>
  );
}

interface MessageInfo {
  author: string;
  message: string | undefined;
  authorImageUri: string | undefined;
  viewShotRef: React.RefObject<ViewShot>;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#efefef",
  },
  notice: {
    width: "90%",
    marginVertical: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#e0c99a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  noticeText: {
    fontSize: 14,
    color: "#5a4630",
    flexShrink: 1,
  },
  noticeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#5a4630",
    // 指で押せる高さ（48px）を割らない
    minHeight: 48,
    justifyContent: "center",
  },
  noticeButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  textArea: {
    width: "90%",
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginVertical: 5,
    height: 80,
  },
  chatTextMessageRenderer: {
    width: 377,
    paddingHorizontal: 24,
    paddingVertical: 4,
    backgroundColor: "#fcfcfc",
    flexDirection: "row",
    alignItems: "flex-start",
    fontFamily: "Roboto, Arial, sans-serif",
  },
  authorText: {
    color: "#11111199",
  },
  authorImage: {
    width: 24,
    height: 24,
    marginRight: 16,
    backgroundColor: "transparent",
    borderRadius: "50%",
    display: "flex",
    color: "white",
  },
  message: {
    width: 297,
    fontSize: 13,
    lineHeight: 19.5,
    textAlign: "left",
  },
});
