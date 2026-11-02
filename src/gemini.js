/**
 * Gemini Interactions API payload helpers.
 * This module deliberately contains no API key and is safe to import in tests.
 */

export const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export function buildChatPayload({
  input,
  systemInstruction,
  previousInteractionId,
  model = "gemini-3.8-flash",
  store = true
}) {
  const safeInput = String(input ?? "").trim();
  if (!safeInput) {
    throw new TypeError("A non-empty input message is required.");
  }

  const payload = {
    model,
    input: safeInput,
    system_instruction: String(systemInstruction ?? "").slice(0, 30000)
  };

  if (store === false) payload.store = false;

  if (
    typeof previousInteractionId === "string" &&
    previousInteractionId.length > 0 &&
    previousInteractionId.length <= 256
  ) {
    payload.previous_interaction_id = previousInteractionId;
  }

  return payload;
}

export function buildTtsPayload({
  text,
  model = "gemini-3.8-flash-tts",
  voice = "Kore"
}) {
  const transcript = String(text ?? "").trim().slice(0, 4000);
  if (!transcript) {
    throw new TypeError("Text is required for speech generation.");
  }

  return {
    model,
    input: [{
      type: "user_input",
      content: [{
        type: "text",
        text: transcript,
        annotations: [{
          type: "speech_metadata",
          style: "Warm, clear, friendly, confident engineering tutor. Natural conversational pace."
        }]
      }]
    }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: [{ voice }]
    },
    store: false
  };
}

export function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const steps = Array.isArray(data?.steps) ? data.steps : [];

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step?.type !== "model_output" && step?.type !== "message") continue;
    const parts = Array.isArray(step.content) ? step.content : [];
    const text = parts
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("");
    if (text.trim()) return text.trim();
  }

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const parts = Array.isArray(steps[i]?.content) ? steps[i].content : [];
    const text = parts
      .filter(part => typeof part?.text === "string")
      .map(part => part.text)
      .join("");
    if (text.trim()) return text.trim();
  }

  return "";
}

export function extractOutputAudio(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const parts = Array.isArray(steps[i]?.content) ? steps[i].content : [];
    const audio = parts.find(
      part => part?.type === "audio" &&
        typeof part.data === "string" &&
        part.data.length > 0
    );
    if (audio) return audio;
  }

  if (typeof data?.output_audio?.data === "string") {
    return data.output_audio;
  }

  return null;
}

export function safeGeminiError(data, status, statusText = "") {
  const message =
    data?.error?.message ||
    data?.message ||
    `Gemini request failed (${status} ${statusText}).`;
  return String(message).slice(0, 1000);
}
