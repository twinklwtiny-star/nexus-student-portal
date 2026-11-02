(() => {
  "use strict";

  const STORAGE_KEY = "nexus_projects_v4";
  const state = {
    projects: [],
    role: "viewer",
    adminAuthenticated: false,
    activeProject: null,
    previousInteractionId: null,
    busy: false,
    voiceEnabled: true
  };

  const $ = id => document.getElementById(id);

  function safeStorageGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (error) { console.warn("Browser storage is unavailable:", error); return null; }
  }

  function safeStorageSet(key, value) {
    try { window.localStorage.setItem(key, value); }
    catch (error) { console.warn("Could not save local project data:", error); }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      credentials: "same-origin"
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`Server returned an unreadable response (${response.status}).`); }

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  function persistProjects() {
    safeStorageSet(STORAGE_KEY, JSON.stringify(state.projects));
  }

  function loadProjects() {
    const stored = safeStorageGet(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) state.projects = parsed;
      } catch (error) {
        console.warn("Saved project data was invalid; using bundled defaults.", error);
      }
    }
    if (!state.projects.length) {
      state.projects = (window.NEXUS_PROJECTS || []).map(project => ({ ...project }));
    }
  }

  function renderProjects() {
    const grid = $("projects-grid");
    const search = $("search-input").value.trim().toLowerCase();
    const category = $("category-select").value;
    const filtered = state.projects.filter(project => {
      const text = `${project.title || ""} ${project.description || ""}`.toLowerCase();
      return text.includes(search) && (category === "ALL" || project.category === category);
    });

    $("stat-project-count").textContent = String(state.projects.length);
    $("visible-count").textContent = String(filtered.length);
    $("empty-state").classList.toggle("hidden", filtered.length !== 0);

    grid.replaceChildren();
    for (const project of filtered) {
      const card = document.createElement("article");
      card.className = "project-card";
      const thumb = safeHttpUrl(project.thumbnail) || "https://placehold.co/640x360/0b1424/00e4f5?text=NEXUS+Project";
      card.innerHTML = `
        <div class="project-image">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(project.title)}" loading="lazy" referrerpolicy="no-referrer">
          <span class="tag">${escapeHtml(project.category)}</span>
        </div>
        <div class="project-body">
          <div>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.description).slice(0, 240)}${String(project.description || "").length > 240 ? "…" : ""}</p>
          </div>
          <div class="project-actions">
            <button class="button button-primary" data-action="view" data-id="${escapeHtml(project.id)}" type="button">VIEW BLUEPRINT</button>
            ${state.adminAuthenticated ? `<button class="button button-quiet" data-action="edit" data-id="${escapeHtml(project.id)}" type="button">EDIT</button><button class="button button-quiet" data-action="delete" data-id="${escapeHtml(project.id)}" type="button">DELETE</button>` : ""}
          </div>
        </div>`;
      const image = card.querySelector("img");
      image.addEventListener("error", () => {
        image.src = "https://placehold.co/640x360/0b1424/00e4f5?text=NEXUS+Project";
      }, { once: true });
      grid.appendChild(card);
    }
  }

  function getYoutubeEmbedUrl(value) {
    const url = safeHttpUrl(value);
    if (!url) return "";
    try {
      const parsed = new URL(url);
      let id = "";
      if (parsed.hostname === "youtu.be") id = parsed.pathname.slice(1);
      else if (parsed.hostname.endsWith("youtube.com")) {
        id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    } catch {
      return "";
    }
  }

  async function openProject(id) {
    const project = state.projects.find(item => item.id === id);
    if (!project) return;
    state.activeProject = project;
    $("modal-category").textContent = project.category || "PROJECT";
    $("modal-title").textContent = project.title || "Project";
    $("modal-price").textContent = project.price || "FREE ACCESS";
    $("modal-description").textContent = project.description || "";
    const circuit = safeHttpUrl(project.circuit);
    $("modal-circuit").src = circuit;
    $("modal-circuit").classList.toggle("hidden", !circuit);

    const embed = getYoutubeEmbedUrl(project.youtube);
    $("modal-video-wrap").classList.toggle("hidden", !embed);
    $("modal-video").src = embed;

    const download = safeHttpUrl(project.firmwarePath) || project.firmwarePath || "";
    $("firmware-download").href = download;
    $("modal-code").textContent = "Loading firmware source…";
    $("project-modal").classList.remove("hidden");

    if (download.startsWith("/")) {
      try {
        const response = await fetch(download, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Firmware file could not be loaded.");
        $("modal-code").textContent = await response.text();
      } catch (error) {
        $("modal-code").textContent = `${error.message}\nUse the Download .ino link to try again.`;
      }
    } else {
      $("modal-code").textContent = project.codeSummary || "No source file was attached to this project.";
    }
  }

  function closeModal(id) {
    $(id).classList.add("hidden");
    if (id === "project-modal") {
      $("modal-video").src = "";
      state.activeProject = null;
    }
  }

  async function copyFirmware() {
    const content = $("modal-code").textContent;
    try {
      await navigator.clipboard.writeText(content);
      showNotice("Firmware source copied.");
    } catch {
      showNotice("Clipboard access is unavailable. Use the Download .ino link.");
    }
  }

  function showNotice(message) {
    addChatMessage("assistant", message);
  }

  function addChatMessage(sender, message, audioUrl = "") {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender === "user" ? "user" : "assistant"}`;
    const label = document.createElement("span");
    label.className = "speaker";
    label.textContent = sender === "user" ? "YOU" : "NEXUS AI";
    const body = document.createElement("div");
    body.textContent = String(message);
    bubble.append(label, body);
    if (audioUrl) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = audioUrl;
      audio.setAttribute("aria-label", "Play NEXUS AI voice response");
      bubble.appendChild(audio);
    }
    $("chat-messages").appendChild(bubble);
    $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
    return bubble;
  }

  function buildSystemInstruction() {
    const project = state.activeProject ||
      state.projects.find(item => item.id === "proj-lfr-esp32") ||
      state.projects[0];

    if (!project) {
      return "You are NEXUS AI, a friendly student engineering tutor. Be accurate and say when information is missing.";
    }

    return [
      "You are NEXUS AI, a warm, accurate engineering tutor for a student project portal.",
      "Use the project information below as your source. Be clear and practical.",
      "Do not claim hardware was tested or verified unless the information explicitly says so.",
      "If the written wiring notes conflict with firmware pins, explain both maps and prioritize the code's actual definitions.",
      "Do not invent the motor-driver model, calibration results, or electrical ratings.",
      `PROJECT TITLE: ${project.title}`,
      `PROJECT DESCRIPTION:\n${project.description}`,
      `PROJECT KNOWLEDGE NOTES:\n${project.aiContext || ""}`
    ].join("\n\n").slice(0, 30000);
  }

  function extractText(data) {
    if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      if (!["model_output", "message"].includes(step?.type)) continue;
      const parts = Array.isArray(step.content) ? step.content : [];
      const result = parts.filter(part => part?.type === "text" && typeof part.text === "string").map(part => part.text).join("");
      if (result.trim()) return result.trim();
    }
    return "";
  }

  function extractAudio(data) {
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const parts = Array.isArray(steps[index]?.content) ? steps[index].content : [];
      const audio = parts.find(part => part?.type === "audio" && typeof part.data === "string");
      if (audio) return audio;
    }
    return data?.output_audio?.data ? data.output_audio : null;
  }

  async function callGeminiText(input, options = {}) {
    const data = await requestJson("/api/gemini/chat", {
      method: "POST",
      body: JSON.stringify({
        input,
        systemInstruction: buildSystemInstruction(),
        previousInteractionId: options.useHistory ? state.previousInteractionId : null,
        store: options.store !== false
      })
    });

    if (options.useHistory && data.id) state.previousInteractionId = data.id;
    const text = extractText(data);
    if (!text) throw new Error("Gemini returned no text. Check the selected model and API access.");
    return { text, data };
  }

  function base64ToAudioUrl(base64, mimeType = "audio/wav") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  async function generateVoice(text) {
    const data = await requestJson("/api/gemini/tts", {
      method: "POST",
      body: JSON.stringify({ text: String(text).slice(0, 4000) })
    });
    const audio = extractAudio(data);
    if (!audio) throw new Error("Gemini returned no audio data.");
    return base64ToAudioUrl(audio.data, audio.mime_type || audio.mimeType || "audio/wav");
  }

  function speakFallback(text) {
    if (!state.voiceEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.rate = 1.03;
    window.speechSynthesis.speak(utterance);
  }

  async function sendChatMessage(event) {
    event?.preventDefault();
    if (state.busy) return;
    const input = $("chat-input");
    const query = input.value.trim();
    if (!query) return;

    input.value = "";
    addChatMessage("user", query);
    const typing = addChatMessage("assistant", "NEXUS AI is thinking…");
    state.busy = true;
    $("chat-send-button").disabled = true;

    try {
      const result = await callGeminiText(query, { useHistory: true });
      typing.remove();
      let audioUrl = "";
      if (state.voiceEnabled) {
        try { audioUrl = await generateVoice(result.text); }
        catch (error) { console.warn("Gemini TTS unavailable:", error.message); }
      }
      addChatMessage("assistant", result.text, audioUrl);
      if (audioUrl) {
        const audio = $("chat-messages").lastElementChild.querySelector("audio");
        if (audio) {
          try { await audio.play(); } catch { /* Browser autoplay may be blocked. */ }
        }
      } else if (state.voiceEnabled) {
        speakFallback(result.text);
      }
    } catch (error) {
      typing.remove();
      addChatMessage("assistant", `I could not get a Gemini response. ${error.message}`);
    } finally {
      state.busy = false;
      $("chat-send-button").disabled = false;
      input.focus();
    }
  }

  async function startGreeting() {
    if ($("start-button").dataset.started === "1") return;
    $("start-button").dataset.started = "1";
    $("start-button").disabled = true;
    $("start-button").textContent = "CONNECTING TO NEXUS AI…";

    try {
      const result = await callGeminiText(
        "A visitor has just opened the NEXUS portal. Greet them in 2–3 short sentences. Introduce yourself as NEXUS AI, mention the LINE FOLLOWING ROBOT PROJECT, and tell them to ask questions using the floating PROJECT AI chat bar at the lower-right. Do not give wiring advice in this greeting.",
        { useHistory: true }
      );
      addChatMessage("assistant", result.text);
      if (state.voiceEnabled) {
        try {
          const url = await generateVoice(result.text);
          const bubble = $("chat-messages").lastElementChild;
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.src = url;
          bubble.appendChild(audio);
          try { await audio.play(); } catch { /* user can press Play */ }
        } catch (error) {
          console.warn("Greeting TTS failed:", error.message);
          speakFallback(result.text);
        }
      }
    } catch (error) {
      addChatMessage("assistant", `Welcome to NEXUS. The portal is ready, but Gemini could not connect: ${error.message}`);
    } finally {
      $("start-overlay").classList.add("hidden");
      $("chat-window").classList.remove("hidden");
      $("chat-input").focus();
      $("start-button").disabled = false;
    }
  }

  async function checkServerHealth() {
    try {
      const health = await requestJson("/api/health");
      $("portal-status").innerHTML = '<span class="pulse-dot"></span> SERVER ONLINE';
      $("api-status").textContent = health.geminiConfigured
        ? "Server is online. A Gemini key is configured on the server."
        : "Server is online, but GEMINI_API_KEY is missing from .env.";
      $("api-status").className = `api-status ${health.geminiConfigured ? "ok" : "error"}`;
    } catch (error) {
      $("portal-status").textContent = "SERVER OFFLINE";
      $("api-status").textContent = `Could not reach the local server: ${error.message}`;
      $("api-status").className = "api-status error";
    }
  }

  async function testGemini() {
    const button = $("test-api-button");
    button.disabled = true;
    button.textContent = "TESTING…";
    $("api-status").textContent = "Sending a short test request through the protected server route…";
    $("api-status").className = "api-status";
    try {
      const result = await callGeminiText("Reply with exactly: NEXUS TEXT API OK", { store: false, useHistory: false });
      $("api-status").textContent = `Gemini text generation is working. Response: ${result.text.slice(0, 100)}`;
      $("api-status").className = "api-status ok";
    } catch (error) {
      $("api-status").textContent = `Gemini test failed: ${error.message}`;
      $("api-status").className = "api-status error";
    } finally {
      button.disabled = false;
      button.textContent = "TEST GEMINI CONNECTION";
    }
  }

  async function checkAdminSession() {
    try {
      const result = await requestJson("/api/admin/session");
      if (result.authenticated) {
        state.adminAuthenticated = true;
        state.role = "admin";
        $("admin-button").classList.add("active");
        $("viewer-button").classList.remove("active");
        $("add-project-button").classList.remove("hidden");
      }
    } catch (error) {
      console.warn("Could not check admin session:", error.message);
    }
    renderProjects();
  }

  function openEditModal(project = null) {
    if (!state.adminAuthenticated) return;
    $("project-form").reset();
    $("edit-id").value = project?.id || "";
    $("edit-title-input").value = project?.title || "";
    $("edit-category").value = project?.category || "Robotics & UAV";
    $("edit-price").value = project?.price || "FREE ACCESS";
    $("edit-thumbnail").value = project?.thumbnail || "";
    $("edit-circuit").value = project?.circuit || "";
    $("edit-youtube").value = project?.youtube || "";
    $("edit-description").value = project?.description || "";
    $("edit-context").value = project?.aiContext || "";
    $("edit-title").textContent = project ? "Edit project" : "Add project";
    $("edit-modal").classList.remove("hidden");
  }

  async function handleAdminButton() {
    if (state.adminAuthenticated) {
      try { await requestJson("/api/admin/logout", { method: "POST", body: "{}" }); } catch (error) {
        console.warn("Admin logout request failed:", error.message);
      }
      state.adminAuthenticated = false;
      state.role = "viewer";
      $("admin-button").classList.remove("active");
      $("viewer-button").classList.add("active");
      $("add-project-button").classList.add("hidden");
      renderProjects();
      return;
    }
    $("admin-error").classList.add("hidden");
    $("admin-passcode").value = "";
    $("admin-modal").classList.remove("hidden");
    $("admin-passcode").focus();
  }

  async function submitAdminLogin(event) {
    event.preventDefault();
    const errorNode = $("admin-error");
    errorNode.classList.add("hidden");
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ passcode: $("admin-passcode").value })
      });
      state.adminAuthenticated = true;
      state.role = "admin";
      $("admin-modal").classList.add("hidden");
      $("admin-button").classList.add("active");
      $("viewer-button").classList.remove("active");
      $("add-project-button").classList.remove("hidden");
      renderProjects();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.classList.remove("hidden");
    }
  }

  function saveProject(event) {
    event.preventDefault();
    if (!state.adminAuthenticated) return;

    const id = $("edit-id").value || `proj-${crypto.randomUUID()}`;
    const project = {
      id,
      title: $("edit-title-input").value.trim(),
      category: $("edit-category").value,
      price: $("edit-price").value.trim(),
      thumbnail: safeHttpUrl($("edit-thumbnail").value),
      circuit: safeHttpUrl($("edit-circuit").value),
      youtube: safeHttpUrl($("edit-youtube").value),
      description: $("edit-description").value.trim(),
      aiContext: $("edit-context").value.trim(),
      firmwarePath: ""
    };

    if (!project.thumbnail || !project.circuit) {
      alert("Please provide valid HTTP or HTTPS image URLs.");
      return;
    }

    const index = state.projects.findIndex(item => item.id === id);
    if (index >= 0) state.projects[index] = project;
    else state.projects.unshift(project);

    persistProjects();
    closeModal("edit-modal");
    renderProjects();
  }

  function handleProjectGridClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const project = state.projects.find(item => item.id === button.dataset.id);
    if (!project) return;

    if (button.dataset.action === "view") openProject(project.id);
    if (button.dataset.action === "edit") openEditModal(project);
    if (button.dataset.action === "delete" && state.adminAuthenticated) {
      if (window.confirm(`Delete "${project.title}" from this browser?`)) {
        state.projects = state.projects.filter(item => item.id !== project.id);
        persistProjects();
        renderProjects();
      }
    }
  }

  function setChatOpen(open) {
    $("chat-window").classList.toggle("hidden", !open);
    if (open) $("chat-input").focus();
  }

  function bindEvents() {
    $("start-button").addEventListener("click", startGreeting);
    $("search-input").addEventListener("input", renderProjects);
    $("category-select").addEventListener("change", renderProjects);
    $("projects-grid").addEventListener("click", handleProjectGridClick);
    $("viewer-button").addEventListener("click", () => {
      if (state.adminAuthenticated) $("admin-button").click();
    });
    $("admin-button").addEventListener("click", handleAdminButton);
    $("add-project-button").addEventListener("click", () => openEditModal());
    $("project-form").addEventListener("submit", saveProject);
    $("admin-login-form").addEventListener("submit", submitAdminLogin);
    $("chat-form").addEventListener("submit", sendChatMessage);
    $("chat-toggle-button").addEventListener("click", () => setChatOpen($("chat-window").classList.contains("hidden")));
    $("close-chat-button").addEventListener("click", () => setChatOpen(false));
    $("api-settings-button").addEventListener("click", () => $("api-modal").classList.remove("hidden"));
    $("test-api-button").addEventListener("click", testGemini);
    $("copy-code-button").addEventListener("click", copyFirmware);

    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () => closeModal(button.dataset.close));
    });
    document.querySelectorAll(".overlay").forEach(overlay => {
      overlay.addEventListener("click", event => {
        if (event.target === overlay && overlay.id !== "start-overlay") closeModal(overlay.id);
      });
    });
  }

  async function initialize() {
    loadProjects();
    bindEvents();
    renderProjects();
    await Promise.all([checkServerHealth(), checkAdminSession()]);
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
