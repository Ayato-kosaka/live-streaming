# YouTube Discovery Refactoring - Deployment Guide

## 🎯 Overview

This guide explains how to deploy the refactored YouTube Discovery system that uses:
- **uploads playlist** instead of `search.list` (99.8% quota reduction)
- **OAuth (Doneru)** instead of API Key authentication

## 📋 Pre-Deployment Checklist

### 1. Obtain Doneru Alertbox Key

The `DONERU_ALERTBOX_KEY` is required for OAuth authentication.

**Steps:**
1. Locate the environment variable `EXPO_PUBLIC_DONERU_WSS_URL`
   - Check your `.env` file or environment configuration
   - Example value: `wss://api.doneru.jp/widget/ws?key=YOUR_KEY_HERE`

2. Extract the `key` parameter from the URL
   - If URL is: `wss://api.doneru.jp/widget/ws?key=abc123xyz`
   - Then `DONERU_ALERTBOX_KEY` = `abc123xyz`

### 2. Add GitHub Secret

**In GitHub Repository:**
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `DONERU_ALERTBOX_KEY`
4. Value: `[your extracted key]`
5. Click **Add secret**

### 3. Verify Other GitHub Secrets/Variables

Ensure these are set:
- ✅ `BQ_PROJECT_ID` (variable or secret)
- ✅ `YOUTUBE_CHANNEL_ID` (variable)
- ✅ `FIREBASE_SERVICE_ACCOUNT` (secret)
- ❌ `EXPO_PUBLIC_YOUTUBE_API_KEY` (no longer needed, can be removed)

## 🧪 Testing

### Step 1: Manual Discovery Test

1. Go to **Actions** tab in GitHub
2. Select **Fetch YouTube Chat Data** workflow
3. Click **Run workflow** (dropdown on the right)
4. Use default settings (lookback_days: 10)
5. Click **Run workflow** button

### Step 2: Monitor Execution

Watch the workflow logs:
```
Jobs:
  discover_videos:
    - リポジトリのチェックアウト
    - Python 環境のセットアップ
    - Google Cloud 認証
    - 必要なパッケージのインストール
    - Discovery 実行 ← Check this step
```

**Expected Output:**
```
Discovery 開始: チャンネル [CHANNEL_ID], lookback 10 日
Doneru API から新しいトークンを取得中...
トークン取得成功 (期限: [timestamp], チャンネル: [channel])
uploads playlist ID: [PLAYLIST_ID]
既存の video_id を [N] 件取得 (cutoff: [timestamp])
playlistItems.list page=1 items=50 nextPageToken=[token]
...
playlistItems.list で [M] 件の動画を発見
videos.list で [K] 件のライブアーカイブを取得
UPSERT 完了: [K] 動画
Discovery 処理が正常に完了しました
```

### Step 3: Verify BigQuery

Check the `videos` table:
```sql
SELECT 
  video_id,
  title,
  actual_start_time,
  status,
  first_seen_at
FROM `[PROJECT_ID].youtube_chat.videos`
WHERE DATE(first_seen_at) = CURRENT_DATE()
ORDER BY first_seen_at DESC
LIMIT 10
```

**Expected:**
- New videos discovered today should appear
- `title` and `actual_start_time` should be populated
- `status` should be `PENDING` for new videos

## 📊 Monitoring

### YouTube API Quota

**Check usage in Google Cloud Console:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Dashboard**
4. Click on **YouTube Data API v3**
5. Check **Quotas** tab

**Expected daily usage:** ~20 units
- channels.list: 1 unit
- playlistItems.list: ~9 units (9 pages)
- videos.list: ~9 units (9 batches)

### Discovery Stability

Run the workflow multiple times with the same parameters:
- Results should be consistent
- Number of discovered videos should be stable
- No random fluctuations in results

### Error Monitoring

Check GitHub Actions logs for:
- ✅ No 401 errors (OAuth working)
- ✅ No quota errors (should never happen with 20 units/day)
- ✅ No connection errors to Doneru API

## 🔧 Troubleshooting

### Issue: "環境変数 DONERU_ALERTBOX_KEY が設定されていません"

**Solution:**
- Verify the GitHub Secret is named exactly `DONERU_ALERTBOX_KEY`
- Check the workflow file uses `${{ secrets.DONERU_ALERTBOX_KEY }}`
- Re-add the secret if needed

### Issue: "Doneru API への接続に失敗しました"

**Solution:**
- Verify the Doneru key is correct
- Check if Doneru Cloud Functions are accessible
- Try running: `curl "https://donerutoken-3phus6cpxa-uc.a.run.app/doneruToken?type=alertbox&key=YOUR_KEY"`

### Issue: "uploads playlist ID の取得に失敗しました"

**Solution:**
- Verify `YOUTUBE_CHANNEL_ID` is correct
- Check the channel ID format (should start with `UC`)
- Ensure OAuth token has access to the channel

### Issue: "YouTube API エラー: 403 Forbidden"

**Solution:**
- Check YouTube Data API is enabled in Google Cloud Console
- Verify OAuth token has correct scopes
- Try refreshing the token manually via Doneru

### Issue: "BigQuery エラー"

**Solution:**
- Verify `FIREBASE_SERVICE_ACCOUNT` is valid
- Check BigQuery dataset/tables exist
- Verify service account has BigQuery permissions

## 🎛️ Configuration Options

### Adjust Lookback Days

In GitHub Actions workflow dispatch:
- Default: 10 days
- Range: 1-30 days
- Higher values = more API calls but discover older videos

### Adjust Consecutive Known Threshold

In `python/config.py`:
```python
DISCOVERY_CONSECUTIVE_KNOWN_THRESHOLD: Final[int] = 50
```
- Default: 50 consecutive known videos
- Higher = more thorough but more API calls
- Lower = faster cutoff but might miss videos

## 📈 Expected Results

### First Run After Deployment
- May discover many videos (up to 10 days old)
- Higher API quota usage (but still < 100 units)
- All discovered videos will be PENDING status

### Subsequent Runs
- Should discover only new videos
- Known video cutoff will trigger early
- API quota usage ~20 units/day
- Stable and consistent results

## 🎉 Success Criteria

Your deployment is successful if:
- ✅ Discovery runs without errors
- ✅ New live archive videos are discovered
- ✅ BigQuery is updated with correct data
- ✅ Quota usage is ~20 units/day (99.8% reduction)
- ✅ Results are stable across multiple runs
- ✅ No 401 authentication errors

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check `DISCOVERY_REFACTORING_SUMMARY.md` for technical details
4. Verify all secrets and variables are correctly set

---

**Last Updated:** 2026-01-29  
**Version:** 1.0  
**Author:** GitHub Copilot
