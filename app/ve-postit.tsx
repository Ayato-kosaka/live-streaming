import React, { useState } from "react";
import { View, Text, TextInput, Button, Image, StyleSheet, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import ViewShot from "react-native-view-shot";

export default function App() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // 絵にできなかったときの一行。**押した人がこれから何をするか**だけを書く
  const [failed, setFailed] = useState(false);
  let viewShotRef = React.createRef<ViewShot>();

  const captureAndSave = async () => {
    setFailed(false);
    if (viewShotRef) {
        viewShotRef.current?.capture?.().then(async (uri) => {
          if (Platform.OS === "web") {
            // Web 用のダウンロード処理
            const link = document.createElement("a");
            link.href = uri;
            link.download = `${new Date().getTime()}-${title}.png`;
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
        })
        /* 前は落ちても何も起きなかった。押した本人には**壊れたのか、
           自分の押し方が悪いのか分からない。**ここは配信に映らない
           こちらの道具なので、一行出してよい。中の話は console に。 */
        .catch((e) => {
          console.error("付箋を絵にできなかった —", e);
          setFailed(true);
        });
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Enter Content"
        value={content}
        onChangeText={setContent}
        multiline
      />
      <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1 }}>
        <View style={styles.postit}>
          <Text style={styles.postitTitle}>{title}</Text>
          <Text style={styles.postitContent}>{content.split("\n").map((c,i) => (<Text key={i} style={styles.underline}>{c+"\n"}</Text>))}</Text>
        </View>
      </ViewShot>
      <Button title="Generate & Save" onPress={captureAndSave} />
      {failed ? (
        <Text style={styles.failed}>
          絵にできませんでした。もう一度押してみてください。
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  input: {
    width: "90%",
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginVertical: 5,
  },
  textArea: {
    height: 80,
  },
  postit: {
    width: 240,
    backgroundColor: "#faf7e0",
    padding: 16,
    justifyContent: "flex-start",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  postitTitle: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "HuiFont29",
    color: "#96242a",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#49372b",
    paddingBottom: 8,
},
postitContent: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "left",
    fontFamily: "HuiFont29",
    color: "#908a60",
    marginVertical: 16,
  },
  failed: {
    marginTop: 10,
    fontSize: 13,
    color: "#96242a",
  },
  underline: {
    borderBottomWidth: 1,
    borderBottomColor: "#908a60",
    borderStyle: "dotted",
    paddingBottom: 2,
  },
});