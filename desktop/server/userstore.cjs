/**
 * Everything the app owns: progress, notes, glosses, chats, API keys, and
 * links added after import. Never touches kb/items or kb/raw in the corpus.
 */

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  openrouterKey: "",
  groqKey: "",
  videoCapMb: 300,
  lang: "ar",
  theme: "paper",
  dataRoot: "",
};

function blankState() {
  return {
    items: {},
    days: [],
    stepsDone: {},
    quiz: {},
    chats: [],
  };
}

function createUserStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const settingsFile = path.join(dir, "settings.json");
  const stateFile = path.join(dir, "state.json");
  const addedRoot = path.join(dir, "added");
  fs.mkdirSync(path.join(addedRoot, "kb", "items"), { recursive: true });
  fs.mkdirSync(path.join(addedRoot, "kb", "raw"), { recursive: true });
  fs.mkdirSync(path.join(addedRoot, "kb", "failed"), { recursive: true });
  fs.mkdirSync(path.join(addedRoot, "kb", "media"), { recursive: true });
  fs.mkdirSync(path.join(addedRoot, "thumbs"), { recursive: true });

  function read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }
  function write(file, data) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  let settings = { ...DEFAULTS, ...read(settingsFile, {}) };
  let state = { ...blankState(), ...read(stateFile, {}) };
  if (!state.items || typeof state.items !== "object") state.items = {};
  if (!Array.isArray(state.days)) state.days = [];
  if (!state.stepsDone) state.stepsDone = {};
  if (!state.quiz) state.quiz = {};
  if (!Array.isArray(state.chats)) state.chats = [];

  function publicSettings() {
    return {
      hasOpenRouter: Boolean(settings.openrouterKey),
      hasGroq: Boolean(settings.groqKey),
      videoCapMb: Number(settings.videoCapMb) || 300,
      lang: settings.lang === "en" ? "en" : "ar",
      theme: settings.theme || "paper",
      dataRoot: settings.dataRoot || "",
    };
  }

  function publicUser() {
    return {
      items: state.items,
      days: state.days,
      stepsDone: state.stepsDone,
      quiz: state.quiz,
      chats: state.chats,
    };
  }

  return {
    dir,
    addedRoot,
    get settings() {
      return settings;
    },
    get state() {
      return state;
    },
    publicSettings,
    publicUser,
    keys() {
      return { openrouterKey: settings.openrouterKey || "", groqKey: settings.groqKey || "" };
    },
    updateSettings(patch) {
      const next = { ...settings };
      if (typeof patch.videoCapMb === "number" && patch.videoCapMb > 0) next.videoCapMb = Math.min(4000, patch.videoCapMb);
      if (patch.lang === "en" || patch.lang === "ar") next.lang = patch.lang;
      if (typeof patch.theme === "string" && patch.theme) next.theme = patch.theme;
      if (typeof patch.dataRoot === "string") next.dataRoot = patch.dataRoot;
      if (typeof patch.openrouterKey === "string" && patch.openrouterKey.trim()) next.openrouterKey = patch.openrouterKey.trim();
      if (patch.clearOpenRouter) next.openrouterKey = "";
      if (typeof patch.groqKey === "string" && patch.groqKey.trim()) next.groqKey = patch.groqKey.trim();
      if (patch.clearGroq) next.groqKey = "";
      settings = next;
      write(settingsFile, settings);
      return publicSettings();
    },
    patchItem(id, patch) {
      const cur = state.items[id] || { tried: false, not_relevant: false, notes: "" };
      const next = { ...cur };
      if (typeof patch.tried === "boolean") next.tried = patch.tried;
      if (typeof patch.not_relevant === "boolean") next.not_relevant = patch.not_relevant;
      if (typeof patch.notes === "string") next.notes = patch.notes;
      if (Array.isArray(patch.glosses)) next.glosses = patch.glosses.slice(-40);
      state.items[id] = next;
      write(stateFile, state);
      return next;
    },
    touchDay(day) {
      const d = day || new Date().toISOString().slice(0, 10);
      if (!state.days.includes(d)) {
        state.days.push(d);
        state.days.sort();
        write(stateFile, state);
      }
      return state.days;
    },
    setStepDone(stepId, done) {
      if (done) state.stepsDone[stepId] = true;
      else delete state.stepsDone[stepId];
      write(stateFile, state);
      return state.stepsDone;
    },
    setQuiz(stepId, result) {
      state.quiz[stepId] = result;
      write(stateFile, state);
      return result;
    },
    saveChats(chats) {
      state.chats = Array.isArray(chats) ? chats.slice(-30) : [];
      write(stateFile, state);
      return state.chats;
    },
  };
}

module.exports = { createUserStore };
