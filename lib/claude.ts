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
          document_index: number; // x > 0
          document_title: string | null;
          start_char_index: number; // x > 0
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

// スポットガイド生成レスポンス型
export type ChatBotMessagesResponse = {
  recieveMessages: string[];
};

export const generateChatBotMessages = async (
  sendMessages: string
): Promise<
  ChatBotMessagesResponse & {
    familyId: string;
    variantId: string;
    promptText: string;
    generatedText: string;
    promptInput: Record<string, any>;
    llmModel: string;
    temperature: number;
  }
> => {
  const llmModel = "claude-3-haiku-20240307";
  const temperature = 0.7;

  // 🎨 実際のプロンプト文を構築（JSON形式でレスポンスを要求）
  const prompt = `
Input ${sendMessages}

Use the following JSON format for output.
{
  recieveMessages: string;
}[]`.trim();

  const requestPayload = {
    model: llmModel,
    max_tokens: 512,
    temperature,
    messages: [
      {
        role: "user" as const,
        content: prompt,
      },
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
        .map((item) => (typeof item.recieveMessages === "string" ? item.recieveMessages : null))
        .filter((m): m is string => m !== null)
    : [];

  const validatedResponse: ChatBotMessagesResponse = {
    recieveMessages,
  };

  // 📤 JSONとしてレスポンスをパースし返却
  return {
    ...validatedResponse,
    familyId: response.id,
    variantId: response.model,
    promptText: prompt,
    generatedText: response.content[0]?.text ?? "",
    promptInput: requestPayload,
    llmModel,
    temperature,
  };
};
