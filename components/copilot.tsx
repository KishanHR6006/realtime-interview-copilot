"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import RecorderTranscriber from "@/components/recorder";
import { useCallback, useEffect, useRef, useState } from "react";

import { FLAGS, HistoryData, TranscriptionSegment } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { TranscriptionDisplay } from "@/components/TranscriptionDisplay";

interface CopilotProps {
  addInSavedData: (data: HistoryData) => void;
}

export function Copilot({ addInSavedData }: CopilotProps) {
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [transcriptionSegments, setTranscriptionSegments] = useState<
    TranscriptionSegment[]
  >([]);
  const [flag, setFlag] = useState<FLAGS>(FLAGS.COPILOT);
  const [bg, setBg] = useState<string>("");
  const [completion, setCompletion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const transcriptionBoxRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcription box to bottom
  useEffect(() => {
    if (transcriptionBoxRef.current) {
      transcriptionBoxRef.current.scrollTop =
        transcriptionBoxRef.current.scrollHeight;
    }
  }, [transcriptionSegments]);

  const handleFlag = useCallback((checked: boolean) => {
    if (!checked) {
      setFlag(FLAGS.SUMMERIZER);
    } else {
      setFlag(FLAGS.COPILOT);
    }
  }, []);

  const formRef = useRef<HTMLFormElement>(null);
  const controller = useRef<AbortController | null>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Check if user is typing in an input or textarea
    const target = event.target as HTMLElement;
    const isTypingInInput =
      target.tagName === "INPUT" || target.tagName === "TEXTAREA";

    switch (event.key.toLowerCase()) {
      case "enter":
        // Only trigger global Enter if NOT in an input/textarea
        if (!isTypingInInput) {
          event.preventDefault();
          if (formRef.current) {
            const submitEvent = new Event("submit", {
              cancelable: true,
              bubbles: true,
            });
            formRef.current.dispatchEvent(submitEvent);
          }
        }
        break;
      case "s":
        if (!isTypingInInput) {
          event.preventDefault();
          setFlag(FLAGS.SUMMERIZER);
        }
        break;
      case "c":
        if (!isTypingInInput) {
          event.preventDefault();
          setFlag(FLAGS.COPILOT);
        }
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const addTextinTranscription = (text: string) => {
    setTranscribedText((prev) => prev + " " + text);
  };

  const addTranscriptionSegment = (segment: TranscriptionSegment) => {
    setTranscriptionSegments((prev) => {
      // Check if this is an update to an existing interim segment or a new final segment
      const existingIndex = prev.findIndex((s) => s.id === segment.id);
      if (existingIndex !== -1) {
        // Update existing segment
        const updated = [...prev];
        updated[existingIndex] = segment;
        return updated;
      }
      // Add new segment
      return [...prev, segment];
    });
  };

  const clearTranscriptionChange = () => {
    setTranscribedText("");
    setTranscriptionSegments([]);
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

    // Clear any previous state
    setError(null);
    setCompletion("");
    setIsLoading(true);

    // Create a new AbortController for this request
    if (controller.current) controller.current.abort();
    controller.current = new AbortController();

    try {
      const response = await fetch("/api/completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bg,
          flag,
          prompt: transcribedText,
        }),
        signal: controller.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is null");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the stream chunk
        const chunk = decoder.decode(value, { stream: true });

        // Process Server-Sent Events
        const eventStrings = chunk.split("\n\n");
        for (const eventString of eventStrings) {
          if (!eventString.trim()) continue;

          // Extract the data part of the SSE
          const dataMatch = eventString.match(/data: (.*)/);
          if (!dataMatch) continue;

          const data = dataMatch[1];
          if (data === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.text) {
              setCompletion((text) => text + parsed.text);
            }
          } catch (err) {
            console.error("Error parsing SSE data:", err);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsLoading(false);
      controller.current = null;
    }
  };

  useEffect(() => {
    const savedBg = localStorage.getItem("bg");
    if (savedBg) {
      setBg(savedBg);
    }
  }, []);

  useEffect(() => {
    if (!bg) return;
    localStorage.setItem("bg", bg);
  }, [bg]);

  const handleSave = () => {
    addInSavedData({
      createdAt: new Date().toISOString(),
      data: completion,
      tag: flag === FLAGS.COPILOT ? "Copilot" : "Summerizer",
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-4xl font-bold text-green-700 mb-8">
        Realtime Interview Copilot
      </h2>
      {error && (
        <div className="fixed top-0 left-0 w-full p-4 text-center text-sm bg-red-500 text-white z-50">
          {error.message}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Left Column - Interview Background & Recorder */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="system_prompt" className="text-lg font-semibold text-green-800 mb-2 block">
              Interview Background
            </Label>
            <Textarea
              id="system_prompt"
              placeholder="Type or paste your text here."
              className="resize-none h-32 overflow-hidden w-full"
              style={{ lineHeight: "1.5", maxHeight: "150px" }}
              value={bg}
              onChange={(e) => setBg(e.target.value)}
            />
          </div>
          
          <div>
            <RecorderTranscriber
              addTextinTranscription={addTextinTranscription}
              addTranscriptionSegment={addTranscriptionSegment}
            />
          </div>
        </div>

        {/* Right Column - Transcription */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="transcription" className="text-lg font-semibold text-green-800">
              Transcription
            </Label>
            <button
              type="button"
              className="text-sm text-red-500 hover:text-red-800 hover:underline transition-colors"
              onClick={clearTranscriptionChange}
            >
              clear
            </button>
          </div>
          <div
            ref={transcriptionBoxRef}
            className="h-64 overflow-y-auto border border-green-200 rounded-lg p-4 bg-white"
          >
            <TranscriptionDisplay segments={transcriptionSegments} />
          </div>
        </div>
      </div>

      {/* Mode Selection and Process Button */}
      <div className="bg-white border border-green-200 rounded-lg p-6 mb-8">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-4">
              <Label className="text-green-800 font-medium">
                Summarizer
                <span className="text-xs text-gray-600 ml-1">(S)</span>
              </Label>
              <Switch
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
                onCheckedChange={handleFlag}
                defaultChecked
                checked={flag === FLAGS.COPILOT}
              />
              <Label className="text-green-800 font-medium">
                Copilot
                <span className="text-xs text-gray-600 ml-1">(C)</span>
              </Label>
            </div>

            <Button
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 transition-colors"
              size="sm"
              variant="outline"
              disabled={isLoading}
              type="submit"
              onClick={isLoading ? stop : undefined}
            >
              {isLoading ? "Stop" : "Process"}
              <span className="text-xs text-gray-200 ml-2">(Enter)</span>
            </Button>
          </div>
        </form>
      </div>

      {/* AI Completion Section */}
      {completion && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-800">Response</h3>
            <button
              type="button"
              className="text-sm text-green-600 hover:text-green-800 hover:underline transition-colors"
              onClick={handleSave}
            >
              save
            </button>
          </div>
          <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {completion}
          </div>
        </div>
      )}
    </div>
  );
}
