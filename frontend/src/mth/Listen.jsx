import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioTime, callAudioUrl, preferredVoice, speechSections } from "../audio.js";

const RATES = [1, 1.25, 1.5, 2, 0.75];

// The original call recording, where the free audio source has one (AAPL and MSFT).
function useRecording(url, onFail) {
  const audio = useRef(null);
  const fail = useRef(onFail);
  fail.current = onFail;
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) return;
    const element = new Audio();
    element.preload = "none";
    element.src = url;
    const events = {
      playing: () => setStatus("playing"),
      pause: () => setStatus((current) => current === "ended" ? current : "paused"),
      waiting: () => setStatus("loading"),
      ended: () => setStatus("ended"),
      timeupdate: () => setPosition(element.currentTime),
      durationchange: () => setDuration(Number.isFinite(element.duration) ? element.duration : 0),
      error: () => { setStatus("idle"); fail.current?.("The original recording couldn’t be loaded. Press play to hear the transcript read aloud instead."); },
    };
    for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
    audio.current = element;
    return () => {
      for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
      element.pause();
      element.removeAttribute("src");
      element.load();
      audio.current = null;
    };
  }, [url]);

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    if (element.ended) element.currentTime = 0;
    setError(""); setStatus("loading");
    element.play().catch((reason) => {
      if (reason?.name === "AbortError") return;
      setStatus("idle"); setError("The recording couldn’t start. Try again.");
    });
  }, []);
  const seek = useCallback((time) => {
    const element = audio.current;
    if (!element || !duration) return;
    element.currentTime = Math.max(0, Math.min(duration, time));
    setPosition(element.currentTime);
  }, [duration]);
  const setRate = useCallback((value) => { if (audio.current) audio.current.playbackRate = value; setRateState(value); }, []);
  const stop = useCallback(() => audio.current?.pause(), []);

  return { status, position, duration, rate, error, toggle, seek, skip: (delta) => seek(position + delta), setRate, stop, reading: null };
}

// The saved transcript read by the browser's own voice, a section at a time, tracking the spoken word.
function useReader(passages, transcriptError) {
  const sections = useMemo(() => speechSections(passages || []), [passages]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const [status, setStatus] = useState("idle");
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [rate, setRateState] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState("");
  const session = useRef(0);
  const timer = useRef(null);
  const waiting = useRef(false);
  const live = useRef({});
  live.current = { rate, voice };

  useEffect(() => {
    if (!supported) return;
    function load() {
      const english = window.speechSynthesis.getVoices().filter((item) => /^en(?:-|$)/i.test(item.lang));
      setVoices(english);
      setVoice((current) => english.some((item) => item.voiceURI === current) ? current : preferredVoice(english)?.voiceURI || "");
    }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  const cancel = useCallback(() => {
    session.current += 1;
    clearTimeout(timer.current);
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);
  useEffect(() => cancel, [cancel]);

  const speak = useCallback(function speak(at) {
    cancel();
    const token = session.current;
    const section = sections[at];
    const speech = new SpeechSynthesisUtterance(section.text);
    speech.lang = "en-US";
    speech.rate = live.current.rate;
    const all = window.speechSynthesis.getVoices();
    const chosen = all.find((item) => item.voiceURI === live.current.voice) || preferredVoice(all);
    if (chosen) speech.voice = chosen;
    setIndex(at); setCursor(null); setError(""); setStatus("loading");
    speech.onstart = () => { if (token === session.current) { clearTimeout(timer.current); setStatus("playing"); } };
    speech.onboundary = (event) => {
      if (token !== session.current || event.name !== "word") return;
      const length = event.charLength || section.text.slice(event.charIndex).match(/^\S+/)?.[0].length || 1;
      setCursor({ start: event.charIndex, end: Math.min(section.text.length, event.charIndex + length) });
    };
    speech.onend = () => {
      if (token !== session.current) return;
      clearTimeout(timer.current);
      if (at + 1 < sections.length) speak(at + 1); else { setStatus("ended"); setCursor(null); }
    };
    speech.onerror = (event) => {
      if (token !== session.current || event.error === "interrupted" || event.error === "canceled") return;
      clearTimeout(timer.current); setStatus("idle");
      setError("Your browser couldn’t read this part. Try again, or use a browser with an English voice.");
    };
    timer.current = setTimeout(() => {
      if (token !== session.current) return;
      cancel(); setStatus("idle"); setError("Your browser’s voice didn’t start. Try again, or use another browser.");
    }, 8000);
    window.speechSynthesis.speak(speech);
  }, [sections, cancel]);

  // Play pressed before the transcript arrived: start as soon as it does.
  useEffect(() => {
    if (waiting.current && sections.length) { waiting.current = false; speak(0); }
  }, [sections, speak]);
  useEffect(() => {
    if (waiting.current && transcriptError) { waiting.current = false; setStatus("idle"); setError(transcriptError); }
  }, [transcriptError]);

  const toggle = useCallback(() => {
    if (!supported) { setError("This browser can’t read text aloud. The transcript is still there to read."); return; }
    if (status === "playing") { window.speechSynthesis.pause(); setStatus("paused"); return; }
    if (status === "paused") { window.speechSynthesis.resume(); setStatus("playing"); return; }
    if (!sections.length) {
      if (transcriptError) { setError(transcriptError); return; }
      waiting.current = true; setStatus("loading"); return;
    }
    speak(status === "ended" ? 0 : index);
  }, [supported, status, sections, transcriptError, index, speak]);

  const seek = useCallback((at) => {
    if (!sections.length) return;
    const next = Math.max(0, Math.min(sections.length - 1, Math.round(at)));
    if (status === "playing" || status === "loading") speak(next);
    else { cancel(); setIndex(next); setCursor(null); setStatus(next ? "paused" : "idle"); }
  }, [sections, status, speak, cancel]);

  const playFrom = useCallback((passageId) => {
    const at = sections.findIndex((item) => item.passageId === passageId);
    if (at >= 0 && supported) speak(at);
  }, [sections, supported, speak]);

  // A new rate or voice applies from the start of the current section.
  const restart = (change) => { change(); if (status === "playing") setTimeout(() => speak(index), 0); };
  const section = sections[index];
  return {
    status, position: index, duration: sections.length, rate, error, voices, voice, supported,
    toggle, seek, skip: (delta) => seek(index + delta), playFrom,
    setRate: (value) => restart(() => { live.current.rate = value; setRateState(value); }),
    setVoice: (value) => restart(() => { live.current.voice = value; setVoice(value); }),
    stop: () => { waiting.current = false; cancel(); setStatus(index ? "paused" : "idle"); },
    reading: section && status !== "idle" && status !== "ended" ? { passageId: section.passageId, start: section.start + (cursor?.start ?? 0), end: section.start + (cursor?.end ?? section.text.length), word: Boolean(cursor) } : null,
  };
}

export function useListen(report, passages, transcriptError) {
  const url = callAudioUrl(report);
  const [mode, setModeState] = useState(url ? "recording" : "reader");
  const [note, setNote] = useState("");
  const recording = useRecording(url, (message) => { setNote(message); setModeState("reader"); });
  const reader = useReader(passages, transcriptError);
  const active = mode === "recording" ? recording : reader;
  const setMode = (next) => { recording.stop(); reader.stop(); setNote(""); setModeState(next); };
  return { ...active, mode, note, hasRecording: Boolean(url), setMode, voices: reader.voices, voice: reader.voice, setVoice: reader.setVoice, playFrom: reader.playFrom, stopAll: () => { recording.stop(); reader.stop(); } };
}

export function PlayIcon({ status }) {
  if (status === "loading") return <span className="m-dock-spin" aria-hidden="true" />;
  return status === "playing"
    ? <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="4" y="3" width="4.5" height="14" rx="1.5" fill="currentColor" /><rect x="11.5" y="3" width="4.5" height="14" rx="1.5" fill="currentColor" /></svg>
    : <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5.5 3.3v13.4a1 1 0 0 0 1.5.86l11-6.7a1 1 0 0 0 0-1.72l-11-6.7a1 1 0 0 0-1.5.86z" fill="currentColor" /></svg>;
}

function Bars({ on }) {
  return <span className={`m-bars ${on ? "is-on" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

export function ListenDock({ listen, title, onFollow, onClose }) {
  const recording = listen.mode === "recording";
  const playing = listen.status === "playing";
  const max = recording ? listen.duration || 1 : Math.max(1, listen.duration - 1);
  const value = Math.min(listen.position, max);
  const progress = recording ? (listen.duration ? listen.position / listen.duration : 0) : (listen.duration > 1 ? listen.position / (listen.duration - 1) : 0);
  const state = listen.status === "loading" ? (recording ? "Buffering…" : "Starting…") : playing ? (recording ? "Playing the call" : "Reading aloud") : listen.status === "paused" ? "Paused" : listen.status === "ended" ? "Finished" : recording ? "Original call audio" : "Read aloud";
  const nextRate = RATES[(RATES.indexOf(listen.rate) + 1) % RATES.length];
  const clock = recording ? `${audioTime(listen.position)} / ${listen.duration ? audioTime(listen.duration) : "—:—"}` : listen.duration ? `${listen.position + 1} / ${listen.duration}` : "— / —";
  return <section className={`m-dock ${playing ? "is-playing" : ""}`} aria-label="Call audio">
    <button type="button" className="m-dock-play" onClick={listen.toggle} aria-label={playing ? "Pause" : recording ? "Play the call recording" : "Read the transcript aloud"}><PlayIcon status={listen.status} /></button>
    <div className="m-dock-main">
      <div className="m-dock-top">
        <span className="m-dock-state m-mono"><Bars on={playing} />{state}</span>
        <span className="m-dock-title">{title}</span>
        <span className="m-dock-clock m-mono" aria-live="off">{clock}</span>
      </div>
      <label className="sr-only" htmlFor="m-dock-seek">{recording ? "Recording position" : "Read-aloud section"}</label>
      <input id="m-dock-seek" className="m-dock-seek" type="range" min="0" max={max} step="1" value={value} disabled={!listen.duration}
        style={{ "--p": `${(Math.min(1, progress) * 100).toFixed(2)}%` }} onChange={(event) => listen.seek(Number(event.target.value))}
        aria-valuetext={recording ? `${audioTime(listen.position)} of ${audioTime(listen.duration)}` : `Section ${listen.position + 1} of ${listen.duration}`} />
      {(listen.error || listen.note) && <p className="m-dock-note" role="alert">{listen.error || listen.note}</p>}
    </div>
    <div className="m-dock-tools">
      <button type="button" className="m-dock-btn" disabled={!listen.duration} onClick={() => listen.skip(recording ? -15 : -1)} aria-label={recording ? "Back 15 seconds" : "Previous section"}>{recording ? <>↺<small>15</small></> : "‹"}</button>
      <button type="button" className="m-dock-btn" disabled={!listen.duration} onClick={() => listen.skip(recording ? 15 : 1)} aria-label={recording ? "Forward 15 seconds" : "Next section"}>{recording ? <>↻<small>15</small></> : "›"}</button>
      <button type="button" className="m-dock-btn m-dock-rate m-mono" onClick={() => listen.setRate(nextRate)} aria-label={`Playback speed ${listen.rate}×. Change to ${nextRate}×`}>{listen.rate}×</button>
      {!recording && listen.voices.length > 1 && <label className="m-dock-voice"><span className="sr-only">Reading voice</span>
        <select value={listen.voice} onChange={(event) => listen.setVoice(event.target.value)}>{listen.voices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s+Online.*$/, "")}</option>)}</select>
      </label>}
      {listen.hasRecording && <button type="button" className="m-dock-btn m-dock-mode" onClick={() => listen.setMode(recording ? "reader" : "recording")}>{recording ? "Read aloud instead" : "Original audio"}</button>}
      <button type="button" className="m-dock-btn m-dock-follow" onClick={onFollow}>{recording ? "Transcript" : "Follow along"}</button>
      <button type="button" className="m-dock-btn m-dock-close" onClick={onClose} aria-label="Stop and close the player">×</button>
    </div>
    <p className="m-dock-credit">{recording ? <>Audio via <a href="https://earningscall.biz/docs/audio" target="_blank" rel="noreferrer">EarningsCall</a></> : "Your browser’s voice, not the executives’"}</p>
  </section>;
}
