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

export function buildMeetingCoachPrompt(context: string | undefined, conversation: string) {
  return `You are a real-time meeting coach for internal work calls. Based on what was just said, give the user short, useful suggestions so they sound clear, confident, and professional.

Rules:
- Keep every line to 1-3 sentences max. No filler, no over-explaining.
- Adapt to the type of moment: status update, disagreement/being challenged, planning, clarification, or follow-up.
- If the conversation is unclear or ambiguous, suggest a safe, neutral response instead of guessing.
- Prioritize clarity, confidence, diplomacy, and actionability.
- If the user is being asked a question, answer it directly.
- If someone is challenging or pushing back on the user, help them respond calmly and professionally, never defensively.
- If the user needs more time, give a polished, professional delay response.
- If this is a decision point, suggest the best next step and a concise phrase to say.
- Never suggest anything unethical, deceptive, or inappropriate.

Respond in exactly this format, nothing else:
1. Suggested reply: <clear, confident response to say now>
2. Alternative: <a shorter or softer variant, e.g. a way to buy time or soften the tone>
3. Goal: <one line on what this response achieves in the moment>

${context ? `MEETING CONTEXT: ${context}\n` : ""}RECENT CONVERSATION: ${conversation}
COACHING:`;
}
