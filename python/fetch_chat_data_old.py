import os
import json
import requests
import subprocess

endpoint_url = os.getenv('PYTHON_GAS_API_URL')
hashedPassword = os.getenv('PYTHON_GAS_API_PW')


if not endpoint_url:
    print("環境変数 PYTHON_GAS_API_URL が設定されていません。")
    exit(1)

# GET メソッドでリクエストを送信し、未処理の videoId を取得
try:
    response = requests.get(endpoint_url)
    response.raise_for_status()
    video_ids = response.json().get("video_ids", [])
    print("未処理の videoId リスト:", video_ids)
except requests.exceptions.RequestException as e:
    print(f"リクエストに失敗しました: {e}")
    exit(1)

# yt-dlp でチャットデータを取得し、GASにPOSTする関数
def fetch_and_post_chat_data(video_ids):
    output_dir = "youtube_chat"
    os.makedirs(output_dir, exist_ok=True)

    for video_id in video_ids:
        video_url = f"https://www.youtube.com/watch?v={video_id}"

        # yt-dlpを使ってチャットデータを取得
        try:
            subprocess.run([
                "yt-dlp",
                "--write-subs",
                "--sub-lang", "live_chat",
                "--skip-download",
                "--output", f"{output_dir}/{video_id}.%(ext)s",
                video_url
            ], check=True)
        except subprocess.CalledProcessError as e:
            print(f"Failed to download chat data for video {video_id}: {e}")
            continue

        json_file_path = f"{output_dir}/{video_id}.live_chat.json"
        if not os.path.exists(json_file_path):
            print(f"No chat data found for video {video_id}.")
            continue

        messages = []
        with open(json_file_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    chat_data = json.loads(line.strip())
                    for item in chat_data.get("replayChatItemAction", {}).get("actions", []):
                        try:
                            message = item["addChatItemAction"]["item"]["liveChatTextMessageRenderer"]
                            author = message["authorName"]["simpleText"]
                            text = "".join(
                                    run["text"] if "text" in run else run["emoji"]["emojiId"] if "emoji" in run else str(run)
                                    for run in message["message"]["runs"]
                                )
                            timestampUsec = message["timestampUsec"]
                            messages.append({
                                "video_id": video_id,
                                "author": author,
                                "timestampUsec": timestampUsec,
                                "message": text
                            })
                        except KeyError:
                            continue
                except json.JSONDecodeError:
                    print("JSONの解析中にエラーが発生しました。無視して続行します。")

        payload = {"executeType": "appendChatRow", "chatRows": messages, "hashedPassword": hashedPassword}
        response = requests.post(endpoint_url, json=payload)
        if response.status_code == 200:
            print(f"Successfully posted chat data for video_id: {video_id}")
        else:
            print(f"Failed to post chat data: {response.status_code}, {response.text}")

# 実行
fetch_and_post_chat_data(video_ids)
