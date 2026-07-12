import { useCallback, useEffect, useRef, useState } from "react";
import { FLAGS } from "../../../lib/types";
import { INITIAL_STATE, PopupToBackgroundMessage, SessionState } from "../shared/messages";

const MODE_CONFIG: Record<FLAGS, { label: string; activeColor: string }> = {
  [FLAGS.COPILOT]: { label: "Copilot", activeColor: "bg-blue-600 text-white" },
  [FLAGS.SUMMERIZER]: { label: "Summarize", activeColor: "bg-purple-600 text-white" },
  [FLAGS.TASK]: { label: "Tasks", activeColor: "bg-orange-500 text-white" },
  [FLAGS.MEETING]: { label: "Notes", activeColor: "bg-green-600 text-white" },
  [FLAGS.MEETING_COACH]: { label: "Meeting Coach", activeColor: "bg-teal-600 text-white" },
};

function send(message: PopupToBackgroundMessage): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

export function Popup() {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const bgDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    send({ type: "getState" }).then((s: SessionState) => s && setState(s));
    chrome.action.setBadgeText({ text: "" });

    const listener = (message: any) => {
      if (message?.type === "state") setState(message.state);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [state.transcript]);

  const handleBgChange = useCallback((value: string) => {
    setState((s) => ({ ...s, bg: value }));
    if (bgDebounce.current) clearTimeout(bgDebounce.current);
    bgDebounce.current = setTimeout(() => send({ type: "setBg", bg: value }), 400);
  }, []);

  const toggleRecording = () => send({ type: state.isRecording ? "stop" : "start" });
  const setFlag = (flag: FLAGS) => send({ type: "setFlag", flag });
  const toggleAuto = () => send({ type: "setAutoMode", value: !state.autoMode });
  const processNow = () => send({ type: "process" });
  const dismiss = () => send({ type: "dismissSuggestion" });

  const activeMode = MODE_CONFIG[state.flag];

  return (
    <div className="p-3 flex flex-col gap-3 bg-white text-gray-900 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold">Meeting Coach</h1>
        <button
          type="button"
          onClick={toggleAuto}
          className={`text-xs px-2 py-1 rounded ${state.autoMode ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          Auto {state.autoMode ? "on" : "off"}
        </button>
      </div>

      {state.error && (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded p-2">
          {state.error}
        </div>
      )}

      <textarea
        value={state.bg}
        onChange={(e) => handleBgChange(e.target.value)}
        placeholder="What is this meeting about? (e.g. 'Weekly status update with my manager')"
        className="text-sm border border-gray-200 rounded p-2 h-16 resize-none focus:outline-none focus:border-blue-400"
      />

      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(MODE_CONFIG) as [FLAGS, (typeof MODE_CONFIG)[FLAGS]][]).map(([flag, config]) => (
          <button
            key={flag}
            type="button"
            onClick={() => setFlag(flag)}
            className={`text-xs px-2 py-1 rounded-md font-medium ${
              state.flag === flag ? config.activeColor : "bg-gray-100 text-gray-600"
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleRecording}
        className={`text-sm font-medium py-2 rounded-md text-white ${
          state.isRecording ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {state.isRecording ? "Stop listening" : "Start listening"}
      </button>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700">Transcript</span>
          <button
            type="button"
            onClick={processNow}
            disabled={state.transcript.length === 0 || state.isLoadingSuggestion}
            className="text-xs text-blue-600 disabled:text-gray-300"
          >
            Process now
          </button>
        </div>
        <div ref={transcriptRef} className="h-28 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50 text-xs space-y-1">
          {state.transcript.length === 0 && (
            <p className="text-gray-400">Start listening to see the transcript here...</p>
          )}
          {state.transcript.map((line, i) => (
            <p key={i}>
              <span className={line.source === "you" ? "font-semibold text-blue-700" : "font-semibold text-gray-700"}>
                {line.source === "you" ? "You: " : "Them: "}
              </span>
              {line.text}
            </p>
          ))}
        </div>
      </div>

      {(state.suggestion || state.isLoadingSuggestion) && (
        <div className="border border-gray-200 rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium text-white px-1.5 py-0.5 rounded ${activeMode.activeColor.split(" ")[0]}`}>
              {activeMode.label}
            </span>
            {state.suggestion && (
              <button type="button" onClick={dismiss} className="text-xs text-gray-400 hover:text-gray-600">
                dismiss
              </button>
            )}
          </div>
          {state.isLoadingSuggestion && !state.suggestion && (
            <p className="text-xs text-gray-400">Generating...</p>
          )}
          <p className="text-xs whitespace-pre-wrap leading-relaxed">{state.suggestion}</p>
        </div>
      )}
    </div>
  );
}
