import { FLAGS } from "../../../lib/types";

export type TranscriptSource = "you" | "them";

export interface TranscriptLine {
  source: TranscriptSource;
  text: string;
  timestamp: string;
}

export interface SessionState {
  isRecording: boolean;
  flag: FLAGS;
  bg: string;
  autoMode: boolean;
  transcript: TranscriptLine[];
  suggestion: string | null;
  isLoadingSuggestion: boolean;
  error: string | null;
}

// Popup -> background
export type PopupToBackgroundMessage =
  | { type: "start" }
  | { type: "stop" }
  | { type: "getState" }
  | { type: "setBg"; bg: string }
  | { type: "setFlag"; flag: FLAGS }
  | { type: "setAutoMode"; value: boolean }
  | { type: "process" }
  | { type: "dismissSuggestion" };

// Background -> offscreen
export type BackgroundToOffscreenMessage =
  | { type: "offscreen:start"; tabStreamId: string; deepgramKey: string }
  | { type: "offscreen:stop" };

// Offscreen -> background
export type OffscreenToBackgroundMessage =
  | { type: "offscreen:transcript"; source: TranscriptSource; text: string }
  | { type: "offscreen:error"; message: string }
  | { type: "offscreen:ready" };

// Background -> popup (broadcast)
export type BackgroundToPopupMessage = { type: "state"; state: SessionState };

export const INITIAL_STATE: SessionState = {
  isRecording: false,
  flag: FLAGS.MEETING_COACH,
  bg: "",
  autoMode: false,
  transcript: [],
  suggestion: null,
  isLoadingSuggestion: false,
  error: null,
};
