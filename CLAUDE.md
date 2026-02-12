# CLAUDE.md

## Project Overview

Realtime Interview Copilot is a Progressive Web Application (PWA) that provides real-time audio transcription and AI-powered response generation during interviews. It uses Deepgram for live speech-to-text and Google Gemini (via Cloudflare AI Gateway) for streaming AI responses.

**Live domain:** `copilot.vedgupta.in`

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript 5.9
- **Styling:** Tailwind CSS 4 with `tailwindcss-animate` plugin
- **UI Components:** Shadcn/UI (Radix UI primitives, CVA for variants)
- **Linter/Formatter:** Biome 2 (primary), ESLint with `next/core-web-vitals` (secondary)
- **Deployment:** Cloudflare Workers via `@opennextjs/cloudflare` and Wrangler
- **External APIs:** Deepgram (transcription), Google Generative AI / Gemini (completions)
- **Icons:** Lucide React, Radix UI Icons

## Repository Structure

```
app/
  api/
    completion/route.ts   # POST - Streams AI responses via Gemini SSE
    deepgram/route.ts     # GET/POST - Generates temporary Deepgram API keys
    actions/deepgram.ts   # Server action for Deepgram
  layout.tsx              # Root layout with PWA setup, Inter font
  page.tsx                # Entry point, renders MainPage
  globals.css             # Global styles and animations
  manifest.ts             # PWA web app manifest

components/
  ui/                     # Shadcn/UI primitives (button, card, input, etc.)
  copilot.tsx             # Main copilot interface (mode switching, transcription, AI responses)
  recorder.tsx            # Audio recording with Deepgram WebSocket transcription
  main.tsx                # Top-level page layout orchestrating all components
  QuestionAssistant.tsx   # Draggable floating interview Q&A helper
  AIAssistant.tsx         # Floating AI chat assistant
  History.tsx             # Saved responses history (localStorage)
  TranscriptionDisplay.tsx # Real-time transcription display
  TranscriptionLine.tsx   # Individual transcription line component
  InstallPWA.tsx          # PWA installation prompt
  PWARegister.tsx         # Service worker registration
  Loader.tsx              # Loading indicator

lib/
  types.ts                # Shared TypeScript types and enums (FLAGS, HistoryData, TranscriptionSegment)
  utils.ts                # Utility functions: cn() for classnames, prompt builders

public/
  sw.js                   # Service worker (cache-first strategy)
  icons/                  # PWA icons (favicon, apple-touch-icon, etc.)
```

## Development Commands

```bash
npm run dev              # Start local dev server
npm run dev:https        # Start dev server with HTTPS (needed for microphone access)
npm run build            # Production build
npm run start            # Start production server
npm run fix              # Format all files with Biome
npm run cf-preview       # Build and preview on Cloudflare Workers
npm run cf-deploy        # Build and deploy to Cloudflare Workers
npm run cf-typegen       # Generate Cloudflare environment types
```

## Environment Variables

Required in `.env.local` (see `.env.local.txt` for reference):

- `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI API key
- `DEEPGRAM_API_KEY` - Deepgram API key for transcription

## Code Style and Conventions

### Formatting (Biome)

- 2-space indentation
- 80-character line width
- LF line endings
- Semicolons always
- Arrow function parentheses always
- Double quotes for JSX, bracket spacing enabled

### Component Patterns

- Client components use `"use client"` directive at the top
- Server actions use `"use server"` directive
- Path alias: `@/*` maps to project root (e.g., `@/components/ui/button`)
- Classname utility: use `cn()` from `@/lib/utils` for merging Tailwind classes
- Shadcn components live in `components/ui/` and use CVA for variant management

### State Management

- React `useState`/`useRef` for local component state
- `AbortController` for cancelling streaming requests
- `useQueue` hook (from `@uidotdev/usehooks`) for audio chunk buffering
- No global state library; state is prop-drilled or component-local

### Data Persistence

- All user data stored client-side via `localStorage`:
  - `savedData` - JSON array of `HistoryData` objects (saved responses)
  - `bg` - Interview background text
- No server-side database; API routes are stateless

### API Patterns

- API routes use Next.js App Router conventions (`app/api/*/route.ts`)
- AI completion endpoint streams via Server-Sent Events (SSE)
- SSE stream termination uses `data: [DONE]\n\n` marker
- Deepgram integration uses temporary API keys with 10-minute TTL
- AI requests route through Cloudflare AI Gateway for rate limiting/caching

### Two Modes

- **Copilot mode** (`FLAGS.COPILOT`): Generates interview responses using background context + conversation transcript
- **Summarizer mode** (`FLAGS.SUMMERIZER`): Summarizes transcribed text without additional context

Note: The enum value is intentionally spelled `SUMMERIZER` (not `SUMMARIZER`) - maintain this existing spelling for consistency.

### Error Handling

- Gemini safety filter responses are handled explicitly (SAFETY, RECITATION, LANGUAGE, etc.)
- SSE stream errors are sent as JSON within `data:` frames
- Deepgram errors logged to console with user-facing feedback

## Key Architecture Decisions

1. **No Google AI SDK** - Direct `fetch()` to Gemini API to avoid `XMLHttpRequest is not defined` errors in edge/worker environments
2. **Cloudflare AI Gateway** - All Gemini requests proxy through Cloudflare for rate limiting, caching, and observability
3. **Temporary Deepgram keys** - Server generates short-lived API keys (10 min) rather than exposing the main key to clients
4. **PWA** - Full Progressive Web App with service worker, manifest, and install prompts for mobile use

## Testing

No test framework is currently configured. Type checking is performed at build time via TypeScript.

## Keyboard Shortcuts (User-Facing)

- `K` - Focus Ask AI input
- `S` - Switch to Summarizer mode
- `C` - Switch to Copilot mode
- `Enter` - Submit/Process (when not in a text input)
- `Escape` - Clear AI answer
