import { useEffect, useRef, useState } from "react";
import { audioTime, callAudioUrl } from "./audio.js";
import TranscriptReader from "./TranscriptReader.jsx";

export default function CallReplay({ result, onPlayback, onTranscript }) {
  const url = callAudioUrl(result);
  const [reader, setReader] = useState(!url);
  const [reason, setReason] = useState("");
  if (reader) return <TranscriptReader result={result} reason={reason} onPlayback={onPlayback} onTranscript={onTranscript} onRecording={url ? () => { setReader(false); setReason(""); } : null} />;
  return <RecordingPlayer result={result} url={url} onPlayback={onPlayback} onTranscript={onTranscript} onReader={(message = "") => { setReason(message); setReader(true); }} />;
}

function RecordingPlayer({ result, url, onReader, onPlayback, onTranscript }) {
  const audio = useRef(null);
  const canvas = useRef(null);
  const graph = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = audio.current;
    return () => { element?.pause(); graph.current?.context.close(); };
  }, []);

  useEffect(() => {
    onPlayback?.({ mode: "recording", playing, ready: true, loading: buffering && !playing, toggle: togglePlayback });
  }, [playing, buffering, onPlayback]);

  useEffect(() => {
    if (!playing || !graph.current) return;
    let frame;
    const { analyser, data } = graph.current;
    const drawing = canvas.current.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function draw() {
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas.current;
      drawing.clearRect(0, 0, width, height);
      for (let i = 0; i < 48; i++) {
        drawing.fillStyle = i % 4 === 0 ? "#ffd85c" : "#a7c8ff";
        const amplitude = Math.max(3, data[Math.floor(i * data.length / 48)] / 255 * (height - 8));
        drawing.fillRect(i * width / 48, (height - amplitude) / 2, width / 48 - 4, amplitude);
      }
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  async function togglePlayback() {
    const element = audio.current;
    if (!element.paused) { element.pause(); return; }
    setError(""); setBuffering(true);
    try {
      if (element.error) element.load();
      const AudioGraph = window.AudioContext || window.webkitAudioContext;
      if (!graph.current && AudioGraph) {
        const context = new AudioGraph();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaElementSource(element).connect(analyser);
        analyser.connect(context.destination);
        graph.current = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
      }
      await graph.current?.context.resume();
      await element.play();
    } catch {
      setError("The recording could not play. Try again, or use transcript read-aloud below.");
      setPlaying(false);
    } finally { setBuffering(false); }
  }

  function seek(time) {
    const next = Math.max(0, Math.min(duration, time));
    audio.current.currentTime = next;
    setPosition(next);
  }

  return <div className="call-replay">
    <audio ref={audio} src={url} crossOrigin="anonymous" preload="none"
      onPlaying={() => { setPlaying(true); setBuffering(false); }}
      onPause={() => { setPlaying(false); setBuffering(false); }}
      onWaiting={() => setBuffering(true)}
      onSeeked={() => setBuffering(false)}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={() => onReader("The original recording couldn’t be loaded.")}
    />
    <div className={`audio-player ${playing ? "audio-playing" : ""}`}>
      <div className="audio-status"><span>{buffering ? "Buffering audio…" : playing ? "Playing the original call" : position ? "Playback paused" : "Full earnings call"}</span><span>Q{result.quarter} FY{result.year}</span></div>
      <div className="audio-visual" aria-hidden="true"><canvas ref={canvas} width="672" height="96" /><span className="audio-baseline" /></div>
      <label className="sr-only" htmlFor="audio-seek">Recording position</label>
      <input id="audio-seek" className="audio-seek" type="range" min="0" max={duration || 1} step="1" value={Math.min(position, duration || 1)} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} aria-valuetext={`${audioTime(position)} of ${audioTime(duration)}`} />
      <div className="audio-transport"><button type="button" className="audio-play" onClick={togglePlayback} disabled={buffering && !playing} aria-label={playing ? "Pause call audio" : "Play call audio"}>{buffering ? <span className="spinner" /> : <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>}</button><button type="button" className="audio-skip" disabled={!duration} onClick={() => seek(position - 15)} aria-label="Skip back 15 seconds">↶<small>15</small></button><button type="button" className="audio-skip" disabled={!duration} onClick={() => seek(position + 15)} aria-label="Skip forward 15 seconds">↷<small>15</small></button><span className="audio-clock">{audioTime(position)} <span>/ {duration ? audioTime(duration) : "—:—"}</span></span><label className="sr-only" htmlFor="audio-speed">Playback speed</label><select id="audio-speed" className="audio-speed" defaultValue="1" onChange={(event) => { audio.current.playbackRate = Number(event.target.value); }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div>
    </div>
    {error && <p className="audio-error" role="alert">{error}</p>}
    {onTranscript && <button type="button" className="follow-transcript-btn" onClick={onTranscript}>Read full transcript →</button>}
    <p className="replay-credit">Original audio via <a href="https://earningscall.biz/docs/audio" target="_blank" rel="noreferrer">EarningsCall</a> · <a href={url} target="_blank" rel="noreferrer">Open audio source ↗</a> · <button type="button" onClick={() => onReader("You selected transcript read-aloud.")}>Use transcript read-aloud</button></p>
  </div>;
}
