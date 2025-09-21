# Live Streaming App
Live streaming application is an Expo React Native project that creates interactive streaming overlays and chat displays for content creators. It includes AlertBox for donation notifications, Chat Display with AI responses, and integrates with YouTube APIs via Firebase Functions.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively
- Bootstrap, build, and test the repository:
  - `npm install` -- takes 40-50 seconds on fresh install. NEVER CANCEL. Set timeout to 120+ seconds.
  - `npx expo export --platform web` -- **FIRST BUILD**: takes 30-31 seconds. **SUBSEQUENT BUILDS**: takes 5-6 seconds. NEVER CANCEL. Set timeout to 60+ minutes for safety.
  - `npx jest --testPathPattern=ThemedText-test` -- takes under 1 second. Test suite is minimal but functional.
- Run the web application:
  - ALWAYS run the bootstrapping steps first: `npm install` and `npx expo export --platform web`
  - Serve locally: `python3 -m http.server 8000 --directory dist`
  - Access at: http://localhost:8000
  - Routes available: `/`, `/alertbox`, `/chat-display`, `/ve-postit`, `/ve-comment`
- Run development server (alternative to build approach):
  - `npx expo start --web` -- starts Metro bundler on port 8081
  - Note: May encounter compatibility warnings about react-native-view-shot version

## Validation
- Always manually validate any new code by building and serving the web application after making changes.
- ALWAYS test the key application routes: `/alertbox` and `/chat-display` after making changes.
- The application shows blank white pages by design - they are meant to be overlays for streaming software.
- Console logs indicate the app is working (logging to external services).
- You can build and run the web version of the application fully.
- Always run `npm run lint` and `npm run typecheck` before you are done or the CI (.github/workflows/) will fail.

## Common Tasks

### Build & Development Commands
- `npm install` -- Install dependencies
- `npm run dev` or `npm start` -- Start Expo development server
- `npx expo start --web` -- Start web development server
- `npx expo export --platform web` -- Build for web deployment
- `npm test` -- Run tests (single test, runs in watch mode - exit with Ctrl+C)
- `npm run lint` -- Run ESLint (auto-configures on first run)
- `npm run typecheck` -- Run TypeScript type checking
- `npm run reset-project` -- Reset project structure (moves current app to app-example)

### Firebase Functions
- `cd functions && npm install` -- Install functions dependencies
- `cd functions && npm run build` -- Build TypeScript functions (fast, under 1 second)
- `cd functions && npm run lint` -- Lint functions code
- Note: Requires Node.js 22 (currently on 20.19.5, shows engine warnings but works)

### Python Scripts
- Required packages: `pip3 install requests yt-dlp`
- `python3 python/fetch_chat_data.py` -- Fetch YouTube chat data (requires environment variables)
- Dependencies verified working: requests 2.31.0, yt-dlp 2025.09.05

### Firebase Deployment
- Firebase CLI not included in base dependencies
- Install with: `npm install -g firebase-tools` (takes 5+ minutes)
- Functions deploy: `firebase deploy --only functions`
- Hosting deploy: `firebase deploy --only hosting`

## Architecture Overview

### Key Projects in Codebase
1. **Main Expo App** (`/app/`, `/components/`, `/assets/`)
   - React Native with Expo Router
   - Multi-route streaming overlay application
   - AlertBox: Live donation/superchat notifications with TTS
   - Chat Display: AI-powered chat interaction display
   - VE components: Comment and post-it style overlays

2. **Firebase Functions** (`/functions/`)
   - TypeScript-based cloud functions
   - YouTube API integration for live streaming data
   - Remote config management
   - Comment posting automation

3. **Python Scripts** (`/python/`)
   - YouTube chat data fetching with yt-dlp
   - Batch processing of live stream chat history
   - Integration with Google Apps Script APIs

### Common File Locations
- Main app entry: `/app/index.tsx` (currently blank by design)
- AlertBox component: `/app/alertbox/index.tsx`
- Chat display: `/app/chat-display/index.tsx`
- Configuration: `/app/alertbox/config.ts`
- Firebase functions: `/functions/src/index.ts`
- Python scripts: `/python/fetch_chat_data.py`

### Dependencies & Requirements
- Node.js (works on 20.19.5, prefers 22 for functions)
- Python 3.12+ with requests and yt-dlp packages
- Firebase CLI for deployment (optional for development)
- Environment variables required for API integrations (see .github/workflows/)

### Build Artifacts
- Web build output: `/dist/` directory
- Firebase functions build: `/functions/lib/` directory
- Static routes generated: 14 total routes including dynamic paths

### Known Issues & Workarounds
- ESLint config auto-installs on first `npm run lint` run
- Functions typecheck fails due to missing Firebase dependencies in main project
- React-native-view-shot version compatibility warnings (expected)
- Firebase CLI installation is slow (5+ minutes)
- Application shows blank pages by design (streaming overlays)

This application is designed for live streaming content creators who need interactive overlays for donations, chat engagement, and audience interaction.