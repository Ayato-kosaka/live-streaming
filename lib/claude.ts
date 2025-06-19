// Claude API のレスポンス型
export interface MessageResponse {
    id: string;
    model: string;
    role: "assistant";
    type: "message";
    content: {
        type: "text";
        text: string;
        citations:
        | {
            type: "char_location";
            cited_text: string;
            document_index: number;
            document_title: string | null;
            start_char_index: number;
            end_char_index: number;
        }[]
        | null;
    }[];
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
    stop_sequence: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
}

export type ChatBotMessagesResponse = {
    recieveMessages: string[];
};

export const generateChatBotMessages = async (
    sendMessages: string
): Promise<
    ChatBotMessagesResponse & {
        promptText: string;
        generatedText: string;
        llmModel: string;
        temperature: number;
    }
> => {
    const llmModel = "claude-3-haiku-20240307";
    const temperature = 0.7;

    // 🎨 “あやと” キャラを定義するシステムプロンプト
    const systemPrompt = `
あなたは “あやと” ── 早口ツッコミ芸 × 無職バックパッカー × ゆるアプリ開発者  
（粗品風だが完全オリジナル）の人格を演じるシステムです。  
ユーザーの発話ごとに “短文ツッコミ返し” を生成してください。  

---
■ 固定キャラ設定
- 26歳・定職なし・所持金ほぼゼロ。  
- ヨーロッパ＆中東を長期バックパック中  
- 旅行計画アプリ「Spelieve」、観光ガイドアプリ「なにこれオーディオガイド」を公開済み
- **いま飲食店探しアプリをコード中。**  
- 旅のハプニング・物価・現地飯ネタを7割、
アプリ作りの苦労・リリースの壁・アイデア迷子を3割で混ぜる

■ 返答フォーマット（常に１行・最大60字）
1. 鋭いツッコミ or 相手への問い返し
2. 旅ネタ（7割）／アプリ作りネタ（3割）
3. オチ or 自虐
※改行なし。３要素すべてを１行に詰める。

■ 口調・語尾
- 関西弁＋少しだけ IT・旅スラング混在。  
- 「～やろ」「～やって」「～ちゃう？」「なんでやねん！」多用。  
- 無職・金欠・路上Wi-Fi・ホステル飯・夜行バス・言語迷子で自虐盛り盛り
- アプリのアピールをごり押し

■ ネタの分配ルール
- 旅7：アプリ作り3 の比率を守る
- 両方入れるときは必ず「旅＞アプリ作り」の情報量にする
- アプリ作りネタは専門用語禁止＆素人に伝わる表現だけで構成する
▼ 使っていいアプリ作りネタ例
- アプリの押し売り
- アプリのアイデアが旅中に湧く／消える
- アプリ審査に落ちた／リジェクト食らった
- Wi-Fi不安定でスクショ1枚も送れへん
- ストアの説明文で五か国語と格闘中
- ホステルで電源争奪しながら開発してる

■ サンプル返答
ユーザー：「こんにちは」
→ あやと：「パリの路地でバゲット齧りつつアプリ名まだ決まらんの地獄やろ。」
ユーザー：「今どこ？」
→ あやと：「アンマンの安宿、Wi-Fi死んでアプリ作れへんって何事やねん。」
ユーザー：「アプリ順調？」
→「“なにこれ”の音声登録、モスクで6回怒られて完成したから今すぐ聴けや！」
ユーザー：「稼げてる？」
→「稼げてたらホステルの12人部屋で“飲食店探しボタン”作ってへんわ！」

■ NG
- コード・バグ・Git・デプロイなど技術的な話はNG
- 長文・敬語・標準語解説は不可。  
- ユーザーに安易に同意せず、軽く斬る立場を維持。
`.trim();

    // ユーザー入力と出力フォーマットを指示するプロンプト
    const userPrompt = `
Input: ${sendMessages}

次の形式で出力してください。**JSON文字列ではなく、純粋なJSON配列として返してください**。

[
  {
    "recieveMessages": "ツッコミ返しをここに入れてください"
  }
]

JSON文字列で囲ったり、改行やエスケープ文字は使わないでください。コードブロック（\`\`\`）なども不要です。`.trim();

    const requestPayload = {
        model: llmModel,
        max_tokens: 512,
        temperature,
        system: systemPrompt,
        messages: [
            { role: "user" as const, content: userPrompt },
        ],
    };

    const response: MessageResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
            method: "POST",
            headers: {
                "x-api-key": process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? "",
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
        }
    ).then((res) => res.json());

    if (response.stop_reason && response.stop_reason !== "end_turn") {
        throw new Error(
            `Claude API failed: Unexpected stop_reason - ${response.stop_reason}`
        );
    }

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(response.content[0]?.text || "{}");
    } catch (e) {
        throw new Error(
            `Claude API failed: Invalid JSON response - ${(e as Error).message}`
        );
    }

    // 簡易的なバリデーション
    const recieveMessages: string[] = Array.isArray(parsedJson)
        ? (parsedJson as any[])
            .map((item) =>
                typeof item.recieveMessages === "string"
                    ? item.recieveMessages
                    : null
            )
            .filter((m): m is string => m !== null)
        : [];

    const validatedResponse: ChatBotMessagesResponse = {
        recieveMessages,
    };

    // 📤 JSONとしてレスポンスをパースし返却
    return {
        ...validatedResponse,
        promptText: `${systemPrompt}\n\n${userPrompt}`,
        generatedText: response.content[0]?.text ?? "",
        llmModel,
        temperature,
    };
};
