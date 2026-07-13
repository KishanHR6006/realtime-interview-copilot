"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreateProjectKeyResponse,
  LiveClient,
  LiveTranscriptionEvents,
  createClient,
} from "@deepgram/sdk";
import { FLAGS } from "@/lib/types";

const AUTO_TRIGGER_DELAY_MS = 2500;

// Mic-only Meeting Coach for browsers that can't run the Chrome extension
// (mobile Safari/Chrome, or any desktop browser without "Load unpacked").
// Unlike the extension, this can only hear the user's own microphone — there
// is no browser-standard way to capture "the other side" of a call outside
// a Chrome extension's tabCapture API.
export default function MeetingCoachMobile() {
  const [bg, setBg] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcriptRef = useRef("");
  const connectionRef = useRef<LiveClient | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // The Deepgram WebSocket handshake is a real network round trip; on a
  // mobile connection it can take long enough that MediaRecorder chunks
  // start arriving before it's open, silently dropping the start of the
  // audio. Buffer until Open fires, then flush — same fix already proven
  // in extension/src/shared/deepgram.ts.
  const isListeningRef = useRef(false);
  const preOpenQueueRef = useRef<Blob[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("meetingCoachBg");
    if (saved) setBg(saved);
  }, []);

  useEffect(() => {
    if (bg) localStorage.setItem("meetingCoachBg", bg);
  }, [bg]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const processTranscript = useCallback(async () => {
    if (!transcriptRef.current.trim() || isLoadingSuggestion) return;

    setError(null);
    setSuggestion("");
    setIsLoadingSuggestion(true);

    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bg, flag: FLAGS.MEETING_COACH, prompt: transcriptRef.current }),
        signal: controllerRef.current.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

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
          if (parsed.text) {
            text += parsed.text;
            setSuggestion(text);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsLoadingSuggestion(false);
    }
  }, [bg, isLoadingSuggestion]);

  const resetAutoTimer = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    if (!autoMode) return;
    autoTimerRef.current = setTimeout(() => {
      void processTranscript();
    }, AUTO_TRIGGER_DELAY_MS);
  }, [autoMode, processTranscript]);

  const startRecording = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;

      const res = await fetch("/api/deepgram", { cache: "no-store" });
      const keyBody: unknown = await res.json();
      if (typeof keyBody !== "object" || keyBody === null || !("key" in keyBody)) {
        throw new Error("No Deepgram API key returned from backend");
      }
      const { key } = keyBody as CreateProjectKeyResponse;

      const deepgram = createClient(key);
      const connection = deepgram.listen.live({
        model: "nova-2",
        interim_results: true,
        smart_format: true,
        endpointing: 300,
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        isListeningRef.current = true;
        for (const blob of preOpenQueueRef.current) connection.send(blob);
        preOpenQueueRef.current = [];
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        isListeningRef.current = false;
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (!data.is_final) return;
        const words = data.channel.alternatives[0].words;
        const caption = words.map((w: any) => w.punctuated_word ?? w.word).join(" ");
        if (caption !== "") {
          setTranscript((prev) => (prev ? `${prev}\n${caption}` : caption));
          resetAutoTimer();
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        setError(err instanceof Error ? err.message : String(err));
      });

      connectionRef.current = connection;
      isListeningRef.current = false;
      preOpenQueueRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        if (isListeningRef.current) {
          connectionRef.current?.send(e.data);
        } else {
          preOpenQueueRef.current.push(e.data);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } finally {
      setIsConnecting(false);
    }
  }, [resetAutoTimer]);

  const stopRecording = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    connectionRef.current?.finish();
    connectionRef.current = null;
    isListeningRef.current = false;
    preOpenQueueRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRecording = () => (isRecording ? stopRecording() : startRecording());

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meeting Coach</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mic-only mode — hears what you say, not the other side of the call.
        </p>
      </div>

      {error && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">{error}</div>
      )}

      <div>
        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Meeting Context</label>
        <textarea
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          placeholder="What is this meeting about? (e.g. 'Weekly status update with my manager')"
          className="w-full resize-none h-20 text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isConnecting}
          className={`flex-1 py-3 rounded-lg text-white font-medium disabled:opacity-60 ${
            isRecording ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isConnecting ? "Connecting..." : isRecording ? "Stop listening" : "Start listening"}
        </button>
        <button
          type="button"
          onClick={() => setAutoMode((v) => !v)}
          className={`px-3 py-3 rounded-lg text-sm font-medium ${
            autoMode ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Auto {autoMode ? "on" : "off"}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-gray-700">Transcript</span>
          <button
            type="button"
            onClick={() => void processTranscript()}
            disabled={!transcript.trim() || isLoadingSuggestion}
            className="text-xs text-blue-600 disabled:text-gray-300"
          >
            Process now
          </button>
        </div>
        <div className="h-32 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm whitespace-pre-wrap">
          {transcript || <span className="text-gray-400">Start listening to see the transcript here...</span>}
        </div>
      </div>

      {(suggestion || isLoadingSuggestion) && (
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-white px-2 py-0.5 rounded bg-teal-600">Meeting Coach</span>
            {suggestion && (
              <button type="button" onClick={() => setSuggestion("")} className="text-xs text-gray-400">
                dismiss
              </button>
            )}
          </div>
          {isLoadingSuggestion && !suggestion && <p className="text-sm text-gray-400">Generating...</p>}
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{suggestion}</p>
        </div>
      )}
    </div>
  );
}
