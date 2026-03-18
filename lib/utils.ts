import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function buildPrompt(context: string | undefined, conversation: string) {
  return `You are a real-time AI assistant helping during a live meeting or task. Give a short, direct, helpful response. No filler. No intro. Just the answer in bullet points (max 4 bullets).
${context ? `CONTEXT: ${context}\n` : ""}INPUT: ${conversation}
RESPONSE:`;
}

export function buildSummerizerPrompt(text: string) {
  return `Summarize the following in 3 bullet points max. Be concise and capture key points:
${text}
SUMMARY:`;
}

export function buildTaskPrompt(context: string | undefined, text: string) {
  return `You are a task assistant. Based on the input, provide clear next steps or action items. Be practical and direct. Max 5 bullet points.
${context ? `CONTEXT: ${context}\n` : ""}INPUT: ${text}
ACTION ITEMS:`;
}

export function buildMeetingNotesPrompt(text: string) {
  return `Convert the following conversation/speech into structured meeting notes. Include key decisions, action items, and important points. Use clear headings.
TRANSCRIPT: ${text}
MEETING NOTES:`;
}
