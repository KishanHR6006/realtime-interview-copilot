import { FLAGS } from "@/lib/types";
import { buildPrompt, buildSummerizerPrompt, buildTaskPrompt, buildMeetingNotesPrompt } from "@/lib/utils";

export const runtime = "edge";

export async function POST(req: Request) {
  const {
    bg,
    flag,
    prompt: transcribe,
  } = (await req.json()) as {
    bg: string;
    flag: string;
    prompt: string;
  };

  let prompt = transcribe;
  if (flag === FLAGS.COPILOT) {
    prompt = buildPrompt(bg, transcribe);
  } else if (flag === FLAGS.SUMMERIZER) {
    prompt = buildSummerizerPrompt(transcribe);
  } else if (flag === FLAGS.TASK) {
    prompt = buildTaskPrompt(bg, transcribe);
  } else if (flag === FLAGS.MEETING) {
    prompt = buildMeetingNotesPrompt(transcribe);
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  streamFromGemini(prompt, writer, encoder).catch(async (error) => {
    const errorMessage = JSON.stringify({ error: error.message });
    await writer.write(encoder.encode(`data: ${errorMessage}\n\n`));
    await writer.close();
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function extractTextFromChunk(chunk: any): string | null {
  if (!chunk) return null;
  if (chunk.candidates && chunk.candidates.length > 0) {
    const candidate = chunk.candidates[0];
    const badFinishReasons = ["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"];
    if (candidate.finishReason && badFinishReasons.includes(candidate.finishReason)) {
      return null;
    }
    if (candidate.content?.parts?.length > 0) {
      let text = "";
      for (const part of candidate.content.parts) {
        if (part.text) text += part.text;
      }
      return text;
    }
  }
  return null;
}

async function streamFromGemini(
  prompt: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
) {
  const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  if (!API_KEY) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const MODEL_NAME = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${API_KEY}`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }], role: "user" }],
    generationConfig: {
      maxOutputTokens: 400,
      temperature: 0.7,
    },
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unreadable");
      throw new Error(`API Error: ${response.status} ${response.statusText}. Body: ${errorBody}`);
    }

    if (!response.body) throw new Error("Response body is null");

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    const SSERegex = /^data:\s*(.*)(?:\n\n|\r\r|\r\n\r\n)/;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      let match;
      while ((match = buffer.match(SSERegex)) !== null) {
        const jsonDataString = match[1];
        if (jsonDataString) {
          try {
            const jsonChunk = JSON.parse(jsonDataString);
            const text = extractTextFromChunk(jsonChunk);
            if (text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          } catch (e: any) {
            console.error("Error parsing JSON chunk:", e);
          }
        }
        buffer = buffer.substring(match[0].length);
      }
    }

    await writer.write(encoder.encode("data: [DONE]\n\n"));
  } catch (error: any) {
    const errorMessage = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    try {
      await writer.write(encoder.encode(`data: ${errorMessage}\n\n`));
    } catch {}
  } finally {
    try { await writer.close(); } catch {}
  }
}
