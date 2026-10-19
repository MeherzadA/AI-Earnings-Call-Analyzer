import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { speechSections, preferredVoice } from "./audio.js";

export default function TranscriptReader({ result, reason, onRecording, onPlayback, onTranscript }) {
  const [status, setStatus] = useState("idle");
  const [sections, setSections] = useState([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(null);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const session = useRef(0);
  const mounted = useRef(true);
  const rate = useRef(1);
  const utterance = useRef(null);
  const startTimer = useRef(null);
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    if (!supported) return;
    function loadVoices() {
      const available = window.speechSynthesis.getVoices().filter((voice) => /^en(?:-|$)/i.test(voice.lang));
      setVoices(available);
      setVoiceURI((current) => available.some((voice) => voice.voiceURI === current) ? current : preferredVoice(available)?.voiceURI || "");
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [supported]);

  function stop() {
    session.current += 1;
    clearTimeout(startTimer.current);
    window.speechSynthesis?.cancel();
    utterance.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, []);

  useEffect(() => {
    const section = sections[index];
    onPlayback?.({ mode: "reader", playing: status === "speaking", ready: supported, loading: status === "loading",
      passageId: section?.passageId, start: section ? section.start + (cursor?.start || 0) : 0,
      end: section ? section.start + (cursor?.end ?? section.text.length) : 0,
      word: Boolean(cursor), toggle });
  }, [status, sections, index, cursor, onPlayback]);

  function speak(items, at) {
    stop();
    const token = session.current;
    const speech = new SpeechSynthesisUtterance(items[at].text);
    speech.lang = "en-US";
    speech.rate = rate.current;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((item) => item.voiceURI === voiceURI) || preferredVoice(voices);
    if (voice) speech.voice = voice;
    utterance.current = speech;
    setIndex(at); setCursor(null); setStatus("loading"); setError("");
    speech.onboundary = (event) => {
      if (token !== session.current || event.name !== "word") return;
      const start = event.charIndex;
      const length = event.charLength || items[at].text.slice(start).match(/^\S+/)?.[0].length || 1;
      setCursor({ start, end: Math.min(items[at].text.length, start + length) });
    };
    speech.onstart = () => {
      if (token !== session.current) return;
      clearTimeout(startTimer.current); setStatus("speaking");
    };
    speech.onend = () => {
      if (token !== session.current || !mounted.current) return;
      clearTimeout(startTimer.current);
      if (at + 1 < items.length) speak(items, at + 1);
      else setStatus("ended");
    };
    speech.onerror = () => {
      if (token !== session.current || !mounted.current) return;
      clearTimeout(startTimer.current);
      setError("Your browser couldn’t read this section. Try again or use a browser with an English speech voice.");
      setStatus("idle");
    };
    startTimer.current = setTimeout(() => {
      if (token !== session.current || !mounted.current) return;
      stop(); setStatus("idle"); setError("Your browser’s speech voice didn’t start. Try again or use another browser.");
    }, 8000);
    window.speechSynthesis.speak(speech);
  }

  async function toggle() {
    if (status === "speaking") { window.speechSynthesis.pause(); setStatus("paused"); return; }
    if (status === "paused") { window.speechSynthesis.resume(); setStatus("speaking"); return; }
    setError("");
    let items = sections;
    if (!items.length) {
      setStatus("loading");
      const token = session.current;
      try {
        const source = await apiRequest(`/reports/${result.report_id}/transcript`, { timeoutMs: 90000 });
        if (!mounted.current || token !== session.current) return;
        if (source.ticker !== result.ticker || source.year !== result.year || source.quarter !== result.quarter || (result.research?.source_hash && source.source_hash !== result.research.source_hash)) throw new Error("The saved source does not match this report. Reopen the report before listening.");
        items = speechSections(source.passages);
        if (!items.length) throw new Error("This saved transcript has no text to read.");
        setSections(items);
      } catch (err) {
        if (mounted.current) { setError(err.message); setStatus("idle"); }
        return;
      }
    }
    speak(items, status === "ended" ? 0 : index);
  }

  function jump(at) {
    const next = Math.max(0, Math.min(sections.length - 1, at));
    const resume = status === "speaking";
    stop(); setIndex(next); setCursor(null); setStatus("idle");
    if (resume) speak(sections, next);
  }

  return <div className="call-replay transcript-reader">
    <p className="reader-disclosure"><strong>Transcript read-aloud</strong> · Computer voice</p>
    {supported ? <div className={`audio-player ${status === "speaking" ? "reader-playing" : ""}`}>
      <div className="audio-status"><span>{status === "loading" ? "Preparing read-aloud…" : status === "speaking" ? "Reading the transcript" : status === "paused" ? "Read-aloud paused" : status === "ended" ? "Transcript finished" : "Listen to the saved transcript"}</span><span>{sections[index]?.passageId || `Q${result.quarter} FY${result.year}`}</span></div>
      <div className="reader-activity" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--bar": `${10 + (i * 17 % 39)}px`, "--delay": `${i * -0.07}s` }} />)}</div>
      <label className="sr-only" htmlFor="reader-section">Transcript section</label>
      <input id="reader-section" className="audio-seek" type="range" min="0" max={Math.max(1, sections.length - 1)} step="1" value={index} disabled={!sections.length || status === "loading"} onChange={(event) => jump(Number(event.target.value))} aria-valuetext={`Section ${index + 1} of ${sections.length || "unknown"}`} />
      <div className="audio-transport">
        <button type="button" className="audio-play" onClick={toggle} disabled={status === "loading"} aria-label={status === "speaking" ? "Pause transcript read-aloud" : status === "paused" ? "Resume transcript read-aloud" : "Play transcript read-aloud"}>{status === "loading" ? <span className="spinner" /> : <span aria-hidden="true">{status === "speaking" ? "Ⅱ" : "▶"}</span>}</button>
        <button type="button" className="reader-skip" disabled={!sections.length || index === 0 || status === "loading"} onClick={() => jump(index - 1)} aria-label="Previous transcript section">‹</button>
        <button type="button" className="reader-skip" disabled={!sections.length || index >= sections.length - 1 || status === "loading"} onClick={() => jump(index + 1)} aria-label="Next transcript section">›</button>
        <span className="audio-clock">{sections.length ? `${index + 1} / ${sections.length}` : "Text sections"}</span>
        <label className="sr-only" htmlFor="reader-speed">Read-aloud speed</label>
        <select id="reader-speed" className="audio-speed" defaultValue="1" onChange={(event) => { rate.current = Number(event.target.value); if (status === "speaking") speak(sections, index); else if (status === "paused") { stop(); setStatus("idle"); } }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      </div>
    </div> : <p className="audio-error">This browser has no speech read-aloud support. The transcript remains available to read.</p>}
    {error && <p className="audio-error" role="alert">{error}</p>}
    {(onTranscript || onRecording) && <div className="player-footer">{onTranscript && <button type="button" className="follow-transcript-btn" onClick={onTranscript}>Read full transcript & follow along →</button>}{onRecording && <button type="button" className="text-btn" onClick={onRecording}>Try original recording</button>}</div>}
    <details className="voice-options"><summary>Voice & playback details</summary><label htmlFor="reader-voice">Reading voice</label><select id="reader-voice" value={voiceURI} disabled={!voices.length || status === "loading"} onChange={(event) => { stop(); setStatus("idle"); setVoiceURI(event.target.value); }}>{!voices.length && <option value="">Browser default</option>}{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select><p>Uses voices available in your browser; natural or enhanced voices are preferred when available. Quality varies by device. {reason || "No original recording from our connected source."} This is not the executives’ audio. The animation indicates reading activity.</p></details>
  </div>;
}
