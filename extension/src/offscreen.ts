import { DeepgramLiveTranscriber } from "./shared/deepgram";
import { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "./shared/messages";

let micStream: MediaStream | null = null;
let tabStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let micTranscriber: DeepgramLiveTranscriber | null = null;
let tabTranscriber: DeepgramLiveTranscriber | null = null;

function send(message: OffscreenToBackgroundMessage) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function start(tabStreamId: string, deepgramKey: string) {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });

  // Tab audio capture requires Chrome's non-standard "mandatory" constraint shape,
  // which isn't part of the DOM lib types.
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: tabStreamId,
      },
    },
  } as unknown as MediaStreamConstraints);

  // Capturing the tab mutes its normal output — pipe it back to speakers so the
  // user still hears the call while we transcribe it. AudioContext can start
  // "suspended" (autoplay policy) even in an offscreen document, so explicitly
  // resume it or the tab stays silent.
  audioContext = new AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  const tabSource = audioContext.createMediaStreamSource(tabStream);
  tabSource.connect(audioContext.destination);

  micTranscriber = new DeepgramLiveTranscriber(
    deepgramKey,
    micStream,
    (text) => send({ type: "offscreen:transcript", source: "you", text }),
    (message) => send({ type: "offscreen:error", message: `mic: ${message}` }),
  );
  tabTranscriber = new DeepgramLiveTranscriber(
    deepgramKey,
    tabStream,
    (text) => send({ type: "offscreen:transcript", source: "them", text }),
    (message) => send({ type: "offscreen:error", message: `tab: ${message}` }),
  );

  micTranscriber.start();
  tabTranscriber.start();
}

function stop() {
  micTranscriber?.stop();
  tabTranscriber?.stop();
  micTranscriber = null;
  tabTranscriber = null;

  micStream?.getTracks().forEach((track) => track.stop());
  tabStream?.getTracks().forEach((track) => track.stop());
  micStream = null;
  tabStream = null;

  audioContext?.close();
  audioContext = null;
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "offscreen:start") {
    start(message.tabStreamId, message.deepgramKey).catch((err) => {
      send({ type: "offscreen:error", message: err instanceof Error ? err.message : String(err) });
    });
  } else if (message.type === "offscreen:stop") {
    stop();
  }
});

send({ type: "offscreen:ready" });
