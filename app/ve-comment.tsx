import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Button, Image, StyleSheet, Platform, ScrollView } from "react-native";
import * as MediaLibrary from "expo-media-library";
import ViewShot from "react-native-view-shot";
import { Viewer } from "./alertbox";

export default function App() {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [content, setContent] = useState("");
	const [messageInfos, setMessageInfos] = useState<MessageInfo[]>([]);

	useEffect(() => {
    // GAS API から viewrs を取得する
    const fetchViewers = async () => {
      try {
        const response = await fetch(process.env.EXPO_PUBLIC_GAS_API_URL!);
        const data = await response.json();
        setViewers(data.viewers || []);
      } catch (error) {
        console.error("Error fetching viewers:", error);
      }
    };

    fetchViewers();
	}, []);

  useEffect(() => {
    setMessageInfos(content.split("\n").map(line => {
			const [author, message] = line.split("\t");
			return {author, message, authorImageUri: getIconUrl(author), viewShotRef: React.createRef<ViewShot>()}
    }));
  }, [content])

	const captureAndSaveAll = useCallback(async () => {
		for (const messageInfo of messageInfos) { // 逐次処理 で順番を保証
			await captureAndSave(messageInfo);
		}
	}, [messageInfos])

  const captureAndSave = async (messageInfo: MessageInfo) => {
		const uri = await messageInfo.viewShotRef.current?.capture?.() || '';
		console.log(uri) // TODO 消す
		if (Platform.OS === "web") {
			// Web 用のダウンロード処理
			const link = document.createElement("a");
			link.href = uri;
			link.download = `${new Date().getTime()}-${messageInfo.message?.slice(0,10)}.png`;
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

  const getIconUrl = useCallback(
    (name: string) => 
      viewers.find(v => v.name === name)?.icon && 'https://lh3.googleusercontent.com/d/' + viewers.find(v => v.name === name)?.icon
    , [viewers]);
	const getBackColorFromString = useCallback((s: string) => {
		const colors = ['#D50000', '#C51162', '#AA00FF', '#6200EA', '#304FFE', '#2962FF', '#0091EA', '#00B8D4', '#00BFA5', '#00C853', '#64DD17', '#AEEA00', '#FFD600', '#FFAB00', '#FF6D00', '#DD2C00', '#3E2723', '#212121', '#263238']
		const hash = s.split("").reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 2147483647, 0);
    return colors[hash % (colors.length)];
	}, [])

	if(!viewers.length) return (<View />)

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.textArea}
        placeholder="Enter Content"
        value={content}
        onChangeText={setContent}
        multiline
      />
			{messageInfos.map((messageInfo, i) => 
				(<ViewShot key={i} ref={messageInfo.viewShotRef} style={styles.chatTextMessageRenderer} options={{ format: "png", quality: 1 }}>
					{messageInfo.authorImageUri ? 
						<Image style={styles.authorImage} source={{uri: messageInfo.authorImageUri}} /> :
						<Text style={{...styles.authorImage, backgroundColor: getBackColorFromString(messageInfo.author), alignItems: "center", justifyContent: "center"}}>{messageInfo.author?.slice(0, 1)}</Text>
					}
					<Text style={styles.message}>
						<Text style={styles.authorText}>{messageInfo.author}  </Text><Text>{messageInfo.message}</Text>
					</Text>
				</ViewShot>)
			)}
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
		color: 'white',
  },
  message: {
    width: 297,
    fontSize: 13,
    lineHeight: 19.5,
    textAlign: "left",
  },
});