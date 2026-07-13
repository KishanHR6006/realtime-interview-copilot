import {
  LiveClient,
  LiveTranscriptionEvents,
  createClient,
} from "@deepgram/sdk";

// One Deepgram live connection bound to one MediaStream (mic or tab audio).
// Adapted from components/recorder.tsx, minus the React state — this runs inside
// the offscreen document, which has no React tree.
export class DeepgramLiveTranscriber {
  private connection: LiveClient | null = null;
  private recorder: MediaRecorder | null = null;
  // Only used to buffer chunks recorded before the socket finishes opening;
  // once listening, chunks are sent straight through as they arrive.
  private preOpenQueue: Blob[] = [];
  private isListening = false;

  constructor(
    private apiKey: string,
    private stream: MediaStream,
    private onFinalTranscript: (text: string) => void,
    private onError: (message: string) => void,
  ) {}

  start() {
    const deepgram = createClient(this.apiKey);
    const connection = deepgram.listen.live({
      model: "nova-2",
      interim_results: true,
      smart_format: true,
      endpointing: 300,
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      this.isListening = true;
      for (const blob of this.preOpenQueue) connection.send(blob);
      this.preOpenQueue = [];
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      this.isListening = false;
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      this.onError(err instanceof Error ? err.message : String(err));
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      if (!data.is_final) return;
      const words = data.channel.alternatives[0].words;
      const caption = words
        .map((word: any) => word.punctuated_word ?? word.word)
        .join(" ");
      if (caption !== "") this.onFinalTranscript(caption);
    });

    this.connection = connection;

    const recorder = new MediaRecorder(this.stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      // Send chunks as they arrive instead of batching on a fixed interval —
      // draining slower than MediaRecorder produces (every 100ms) let the
      // backlog grow without bound over a long call.
      if (this.isListening) {
        this.connection?.send(e.data);
      } else {
        this.preOpenQueue.push(e.data);
      }
    };
    recorder.onerror = (e: any) => {
      this.onError(`MediaRecorder error: ${e?.error?.message ?? "unknown"}`);
    };
    recorder.start(100);
    this.recorder = recorder;
  }

  stop() {
    this.recorder?.stop();
    this.connection?.finish();
    this.connection = null;
    this.recorder = null;
    this.preOpenQueue = [];
  }
}
