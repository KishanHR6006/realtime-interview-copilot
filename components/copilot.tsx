"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import RecorderTranscriber from "@/components/recorder";
import { useCallback, useEffect, useRef, useState } from "react";

import { FLAGS, HistoryData, TranscriptionSegment } from "@/lib/types";
import { TranscriptionDisplay } from "@/components/TranscriptionDisplay";

interface CopilotProps {
  addInSavedData: (data: HistoryData) => void;
}

const MODE_CONFIG = {
  [FLAGS.COPILOT]: {
    label: "Copilot",
    shortcut: "C",
    description: "Real-time answers & suggestions",
    color: "bg-blue-600 hover:bg-blue-700",
    activeColor: "bg-blue-600 text-white",
    inactiveColor: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  },
  [FLAGS.SUMMERIZER]: {
    label: "Summarize",
    shortcut: "S",
    description: "Summarize what was said",
    color: "bg-purple-600 hover:bg-purple-700",
    activeColor: "bg-purple-600 text-white",
    inactiveColor: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  },
  [FLAGS.TASK]: {
    label: "Tasks",
    shortcut: "T",
    description: "Extract action items",
    color: "bg-orange-600 hover:bg-orange-700",
    activeColor: "bg-orange-500 text-white",
    inactiveColor: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  },
  [FLAGS.MEETING]: {
    label: "Notes",
    shortcut: "N",
    description: "Structured meeting notes",
    color: "bg-green-600 hover:bg-green-700",
    activeColor: "bg-green-600 text-white",
    inactiveColor: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  },
};

// Auto-trigger: fire AI after this many ms of silence since last transcription
const AUTO_TRIGGER_DELAY_MS = 2500;

export function Copilot({ addInSavedData }: CopilotProps) {
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([]);
  const [flag, setFlag] = useState<FLAGS>(FLAGS.COPILOT);
  const [bg, setBg] = useState<string>("");
  const [completion, setCompletion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const transcriptionBoxRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const controller = useRef<AbortController | null>(null);
  const autoTriggerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscribedText = useRef<string>("");

  // Auto-scroll transcription box
  useEffect(() => {
    if (transcriptionBoxRef.current) {
      transcriptionBoxRef.current.scrollTop = transcriptionBoxRef.current.scrollHeight;
    }
  }, [transcriptionSegments]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isTypingInInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (isTypingInInput) return;

    switch (event.key.toLowerCase()) {
      case "enter":
        event.preventDefault();
        formRef.current?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        break;
      case "c": setFlag(FLAGS.COPILOT); break;
      case "s": setFlag(FLAGS.SUMMERIZER); break;
      case "t": setFlag(FLAGS.TASK); break;
      case "n": setFlag(FLAGS.MEETING); break;
      case "a":
        event.preventDefault();
        setAutoMode((prev) => !prev);
        break;
      case "escape": setCompletion(""); break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-trigger: when new transcription arrives and auto mode is on
  useEffect(() => {
    if (!autoMode || !isRecording || !transcribedText.trim()) return;
    if (transcribedText === lastTranscribedText.current) return;

    // Reset the silence timer on every new transcription chunk
    if (autoTriggerTimer.current) clearTimeout(autoTriggerTimer.current);

    autoTriggerTimer.current = setTimeout(() => {
      if (transcribedText.trim() && transcribedText !== lastTranscribedText.current) {
        lastTranscribedText.current = transcribedText;
        formRef.current?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }, AUTO_TRIGGER_DELAY_MS);

    return () => {
      if (autoTriggerTimer.current) clearTimeout(autoTriggerTimer.current);
    };
  }, [transcribedText, autoMode, isRecording]);

  const addTextinTranscription = (text: string) => {
    setTranscribedText((prev) => prev + " " + text);
  };

  const addTranscriptionSegment = (segment: TranscriptionSegment) => {
    setTranscriptionSegments((prev) => {
      const existingIndex = prev.findIndex((s) => s.id === segment.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = segment;
        return updated;
      }
      return [...prev, segment];
    });
  };

  const clearTranscription = () => {
    setTranscribedText("");
    setTranscriptionSegments([]);
    lastTranscribedText.current = "";
  };

  const stop = () => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!transcribedText.trim()) return;

    setError(null);
    setCompletion("");
    setIsLoading(true);

    if (controller.current) controller.current.abort();
    controller.current = new AbortController();

    try {
      const response = await fetch("/api/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bg, flag, prompt: transcribedText }),
        signal: controller.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is null");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const eventStrings = chunk.split("\n\n");

        for (const eventString of eventStrings) {
          if (!eventString.trim()) continue;
          const dataMatch = eventString.match(/data: (.*)/);
          if (!dataMatch) continue;
          const data = dataMatch[1];
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              const msg = typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message || JSON.stringify(parsed.error);
              throw new Error(msg);
            }
            if (parsed.text) setCompletion((t) => t + parsed.text);
          } catch (err) {
            throw err;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsLoading(false);
      controller.current = null;
    }
  };

  // Persist context
  useEffect(() => {
    const saved = localStorage.getItem("bg");
    if (saved) setBg(saved);
  }, []);

  useEffect(() => {
    if (bg) localStorage.setItem("bg", bg);
  }, [bg]);

  const handleSave = () => {
    addInSavedData({
      createdAt: new Date().toISOString(),
      data: completion,
      tag: MODE_CONFIG[flag].label,
    });
  };

  const activeMode = MODE_CONFIG[flag];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Daily Copilot ⚡</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time AI for meetings, tasks & daily work</p>
        </div>
        {/* Auto-mode toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Auto</span>
          <button
            type="button"
            onClick={() => setAutoMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              autoMode ? "bg-blue-600" : "bg-gray-300"
            }`}
            title="Auto-process on silence (A)"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                autoMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-xs text-gray-400">(A)</span>
          {autoMode && isRecording && (
            <span className="text-xs text-blue-600 font-medium animate-pulse">● listening</span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Context + Recorder */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="system_prompt" className="text-sm font-semibold text-gray-700 mb-1.5 block">
              Meeting / Task Context
            </Label>
            <Textarea
              id="system_prompt"
              placeholder="What is this meeting or task about? (e.g. 'Q2 planning call with product team' or 'writing a performance review')"
              className="resize-none h-28 w-full text-sm border-gray-200 focus:border-blue-400"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
            />
          </div>
          <div>
            <RecorderTranscriber
              addTextinTranscription={addTextinTranscription}
              addTranscriptionSegment={addTranscriptionSegment}
              onRecordingChange={setIsRecording}
            />
          </div>
        </div>

        {/* Right: Transcription */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-700">Live Transcription</Label>
            <button
              type="button"
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
              onClick={clearTranscription}
            >
              clear
            </button>
          </div>
          <div
            ref={transcriptionBoxRef}
            className="h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm"
          >
            <TranscriptionDisplay segments={transcriptionSegments} />
            {!transcriptionSegments.length && (
              <p className="text-gray-400 text-sm">Start recording to see transcription here...</p>
            )}
          </div>
        </div>
      </div>

      {/* Mode selector + Process button */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Mode buttons */}
            <div className="flex gap-2 flex-wrap flex-1">
              {(Object.entries(MODE_CONFIG) as [FLAGS, typeof MODE_CONFIG[FLAGS]][]).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFlag(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    flag === key ? config.activeColor : config.inactiveColor
                  }`}
                  title={config.description}
                >
                  {config.label}
                  <span className="text-xs opacity-60 ml-1">({config.shortcut})</span>
                </button>
              ))}
            </div>

            {/* Process/Stop button */}
            <Button
              className={`w-full sm:w-auto text-white font-medium px-6 py-2 transition-colors ${
                isLoading ? "bg-red-500 hover:bg-red-600" : activeMode.color
              }`}
              size="sm"
              disabled={!transcribedText.trim() && !isLoading}
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? stop : undefined}
            >
              {isLoading ? "⏹ Stop" : `▶ Process`}
              {!isLoading && <span className="text-xs opacity-70 ml-2">(Enter)</span>}
            </Button>
          </div>

          {autoMode && (
            <p className="text-xs text-blue-500 mt-2">
              ⚡ Auto mode on — will process automatically after {AUTO_TRIGGER_DELAY_MS / 1000}s of silence
            </p>
          )}
        </form>
      </div>

      {/* AI Response */}
      {(completion || isLoading) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${activeMode.color.split(" ")[0]}`}>
                {activeMode.label}
              </span>
              <h3 className="text-sm font-semibold text-gray-700">Response</h3>
            </div>
            <div className="flex gap-3">
              {completion && (
                <>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    onClick={handleSave}
                  >
                    save
                  </button>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => setCompletion("")}
                  >
                    dismiss (Esc)
                  </button>
                </>
              )}
            </div>
          </div>
          {isLoading && !completion && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <span className="animate-spin">⟳</span> Generating...
            </div>
          )}
          <div className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
            {completion}
          </div>
        </div>
      )}
    </div>
  );
}
