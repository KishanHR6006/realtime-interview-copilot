// Backend deployment used for both AI completions and Deepgram temp-key issuance.
// Update this (and manifest.json's host_permissions) if the deployment URL changes.
export const API_BASE_URL = "https://realtime-interview-copilot.vercel.app";

// After this much silence since the last transcript line, auto-request a suggestion.
export const AUTO_TRIGGER_DELAY_MS = 2500;
