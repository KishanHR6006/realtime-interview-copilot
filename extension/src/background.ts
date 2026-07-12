import { API_BASE_URL, AUTO_TRIGGER_DELAY_MS } from "./shared/config";
import {
  BackgroundToOffscreenMessage,
  INITIAL_STATE,
  OffscreenToBackgroundMessage,
  PopupToBackgroundMessage,
  SessionState,
  TranscriptLine,
} from "./shared/messages";

const OFFSCREEN_URL = "src/offscreen.html";

let state: SessionState = { ...INITIAL_STATE };
let autoTriggerTimer: ReturnType<typeof setTimeout> | null = null;

async function persistState() {
  await chrome.storage.local.set({ sessionState: state });
}

async function restoreState() {
  const stored = await chrome.storage.local.get("sessionState");
  if (stored.sessionState) {
    state = { ...INITIAL_STATE, ...stored.sessionState, isRecording: false };
  }
}

function broadcastState() {
  chrome.runtime.sendMessage({ type: "state", state }).catch(() => {
    // No popup listening right now — that's fine, it reads state on open.
  });
}

async function updateState(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  broadcastState();
  await persistState();
}

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture tab and microphone audio for live meeting transcription",
  });
}

async function closeOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) await chrome.offscreen.closeDocument();
}

async function fetchDeepgramKey(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/deepgram`, { cache: "no-store" });
  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || !("key" in body)) {
    throw new Error("No Deepgram API key returned from backend");
  }
  return (body as { key: string }).key;
}

function sendToOffscreen(message: BackgroundToOffscreenMessage) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function resetAutoTriggerTimer() {
  if (autoTriggerTimer) clearTimeout(autoTriggerTimer);
  if (!state.autoMode || !state.isRecording) return;
  autoTriggerTimer = setTimeout(() => {
    void runCompletion();
  }, AUTO_TRIGGER_DELAY_MS);
}

function conversationText(): string {
  return state.transcript
    .map((line) => `${line.source === "you" ? "You" : "Them"}: ${line.text}`)
    .join("\n");
}

async function runCompletion() {
  if (state.isLoadingSuggestion || state.transcript.length === 0) return;

  await updateState({ isLoadingSuggestion: true, error: null });

  try {
    const response = await fetch(`${API_BASE_URL}/api/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bg: state.bg, flag: state.flag, prompt: conversationText() }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let suggestion = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const eventString of chunk.split("\n\n")) {
        if (!eventString.trim()) continue;
        const dataMatch = eventString.match(/data: (.*)/);
        if (!dataMatch) continue;
        const data = dataMatch[1];
        if (data === "[DONE]") continue;

        const parsed = JSON.parse(data);
        if (parsed.error) {
          const msg = typeof parsed.error === "string" ? parsed.error : parsed.error.message;
          throw new Error(msg ?? "Unknown completion error");
        }
        if (parsed.text) suggestion += parsed.text;
      }
    }

    await updateState({ suggestion, isLoadingSuggestion: false });
    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: "#0d9488" });
  } catch (err) {
    await updateState({
      isLoadingSuggestion: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function startSession() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) throw new Error("No active tab to capture");

  const [tabStreamId, deepgramKey] = await Promise.all([
    chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }),
    fetchDeepgramKey(),
  ]);

  await ensureOffscreenDocument();
  sendToOffscreen({ type: "offscreen:start", tabStreamId, deepgramKey });

  await updateState({
    isRecording: true,
    transcript: [],
    suggestion: null,
    error: null,
  });
}

async function stopSession() {
  sendToOffscreen({ type: "offscreen:stop" });
  await closeOffscreenDocument();
  if (autoTriggerTimer) clearTimeout(autoTriggerTimer);
  chrome.action.setBadgeText({ text: "" });
  await updateState({ isRecording: false });
}

chrome.runtime.onMessage.addListener((message: PopupToBackgroundMessage | OffscreenToBackgroundMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "getState":
        sendResponse(state);
        break;
      case "start":
        try {
          await startSession();
        } catch (err) {
          await updateState({ error: err instanceof Error ? err.message : String(err) });
        }
        sendResponse(true);
        break;
      case "stop":
        await stopSession();
        sendResponse(true);
        break;
      case "setBg":
        await updateState({ bg: message.bg });
        sendResponse(true);
        break;
      case "setFlag":
        await updateState({ flag: message.flag });
        sendResponse(true);
        break;
      case "setAutoMode":
        await updateState({ autoMode: message.value });
        resetAutoTriggerTimer();
        sendResponse(true);
        break;
      case "process":
        if (autoTriggerTimer) clearTimeout(autoTriggerTimer);
        void runCompletion();
        sendResponse(true);
        break;
      case "dismissSuggestion":
        await updateState({ suggestion: null });
        chrome.action.setBadgeText({ text: "" });
        sendResponse(true);
        break;
      case "offscreen:transcript": {
        const line: TranscriptLine = {
          source: message.source,
          text: message.text,
          timestamp: new Date().toISOString(),
        };
        await updateState({ transcript: [...state.transcript, line] });
        resetAutoTriggerTimer();
        break;
      }
      case "offscreen:error":
        await updateState({ error: message.message });
        break;
      case "offscreen:ready":
        break;
    }
  })();
  return true; // keep the message channel open for the async sendResponse above
});

chrome.runtime.onStartup.addListener(() => {
  void restoreState();
});

void restoreState();
