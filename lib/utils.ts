import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ✅ FIX 4: Shorter prompt = less tokens to process = faster first response
export function buildPrompt(bg: string | undefined, conversation: string) {
  return `You are a live interview co-pilot. Give a short, direct answer to the question below. No filler. No intro. Just the answer in bullet points (max 4 bullets).
${bg ? `CONTEXT: ${bg}\n` : ""}QUESTION: ${conversation}
ANSWER:`;
}

export function buildSummerizerPrompt(text: string) {
  return `Summarize in 3 bullet points max:
${text}
SUMMARY:`;
}
