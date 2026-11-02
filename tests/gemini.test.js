import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatPayload,
  buildTtsPayload,
  extractOutputText,
  extractOutputAudio
} from "../src/gemini.js";

test("buildChatPayload validates input and does not add an API key", () => {
  const payload = buildChatPayload({
    input: "  Explain the weighted position.  ",
    systemInstruction: "You are NEXUS AI.",
    previousInteractionId: "interaction-123"
  });

  assert.equal(payload.input, "Explain the weighted position.");
  assert.equal(payload.model, "gemini-3.8-flash");
  assert.equal(payload.previous_interaction_id, "interaction-123");
  assert.equal(Object.hasOwn(payload, "apiKey"), false);
  assert.equal(Object.hasOwn(payload, "key"), false);
  assert.throws(() => buildChatPayload({ input: "  " }), /non-empty input/);
});

test("buildTtsPayload limits the transcript and is non-stored", () => {
  const payload = buildTtsPayload({ text: "Hello NEXUS." });
  assert.equal(payload.model, "gemini-3.8-flash-tts");
  assert.equal(payload.input[0].content[0].text, "Hello NEXUS.");
  assert.equal(payload.store, false);
  assert.equal(payload.response_format.type, "audio");
  assert.throws(() => buildTtsPayload({ text: "" }), /Text is required/);
});

test("extractOutputText reads output_text and interaction message steps", () => {
  assert.equal(extractOutputText({ output_text: " Ready " }), "Ready");
  assert.equal(
    extractOutputText({
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "A weighted average estimates the line position." }]
      }]
    }),
    "A weighted average estimates the line position."
  );
});

test("extractOutputAudio reads audio parts from interaction steps", () => {
  const audio = extractOutputAudio({
    steps: [{
      type: "model_output",
      content: [{ type: "audio", data: "YmFzZTY0", mime_type: "audio/wav" }]
    }]
  });
  assert.equal(audio.data, "YmFzZTY0");
  assert.equal(audio.mime_type, "audio/wav");
});
