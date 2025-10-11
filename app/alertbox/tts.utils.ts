import * as Speech from "expo-speech";

export const speak = (thingToSay: string, onError: (e: Error) => void) => {
    Speech.stop().then(() =>
        Speech.getAvailableVoicesAsync().then((availableVoices) =>
            Speech.speak(thingToSay, {
                language: "ja-JP",
                onError: (e) => {
                    onError(e);
                },
                onBoundary: () => { },
                pitch: 1.0, // 声の高さ（0.1 - 2.0）
                rate: 1.0, // 読み上げ速度（0.1 - 10.0）
                voice:
                    availableVoices.find((x) => x.language.includes("JP"))
                        ?.identifier || "Google 日本語",
                volume: 0.8, // 音量（0.0 - 1.0）
            })
        )
    );
};