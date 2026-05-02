import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "../styles/barcode-scanner.css";

interface FoodVoicePayload {
  audioBase64: string;
  mimeType: string;
}

interface FoodVoiceRecorderProps {
  onAudioCaptured: (audio: FoodVoicePayload) => void;
  onClose: () => void;
}

type MicrophonePermissionStatus =
  | "granted"
  | "denied"
  | "restricted"
  | "unsupported"
  | "unknown";

const OUTPUT_SAMPLE_RATE = 16_000;

export default function FoodVoiceRecorder({
  onAudioCaptured,
  onClose,
}: FoodVoiceRecorderProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteNodeRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(OUTPUT_SAMPLE_RATE);
  const [error, setError] = useState<string | null>(null);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<MicrophonePermissionStatus>("unknown");

  const microphoneBlocked =
    permissionStatus === "denied" || permissionStatus === "restricted";

  function teardownAudioGraph() {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    muteNodeRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    muteNodeRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }

  function stopStream() {
    teardownAudioGraph();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    sampleRateRef.current = OUTPUT_SAMPLE_RATE;
    setMicrophoneReady(false);
    setRecording(false);
    setFinishing(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function startMicrophone() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This device does not expose microphone capture to the app.");
        return;
      }

      try {
        const nativePermission = await ensureNativeMicrophonePermission();
        if (cancelled) return;
        setPermissionStatus(nativePermission);
        if (nativePermission === "denied" || nativePermission === "restricted") {
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setMicrophoneReady(true);
        setPermissionStatus("granted");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Microphone access failed. Check your OS permissions and try again.";
        setError(message);
        setPermissionStatus("unknown");
      }
    }

    void startMicrophone();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !finishing) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [finishing]);

  function handleClose() {
    stopStream();
    onClose();
  }

  async function handleStartRecording() {
    if (!streamRef.current || !microphoneReady || finishing || recording) return;

    try {
      chunksRef.current = [];

      const AudioContextCtor =
        window.AudioContext ||
        ((window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AudioContextCtor) {
        throw new Error("Voice recording is not supported in this desktop runtime.");
      }

      const audioContext = new AudioContextCtor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(streamRef.current);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const mute = audioContext.createGain();
      mute.gain.value = 0;

      sampleRateRef.current = audioContext.sampleRate;
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(channel));
      };

      source.connect(processor);
      processor.connect(mute);
      mute.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      processorNodeRef.current = processor;
      muteNodeRef.current = mute;

      setRecording(true);
      setError(null);
    } catch (err) {
      teardownAudioGraph();
      const message =
        err instanceof Error ? err.message : "Could not start voice recording.";
      setError(message);
    }
  }

  async function handleStopRecording() {
    if (!recording || finishing) return;

    setFinishing(true);
    setRecording(false);

    try {
      teardownAudioGraph();
      const merged = mergeAudioChunks(chunksRef.current);
      if (!merged.length) {
        throw new Error("The recording was empty. Please try again.");
      }

      const downsampled = downsampleAudio(merged, sampleRateRef.current, OUTPUT_SAMPLE_RATE);
      const wavBytes = encodeWav(downsampled, OUTPUT_SAMPLE_RATE);
      stopStream();
      onAudioCaptured({
        audioBase64: bytesToBase64(wavBytes),
        mimeType: "audio/wav",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "The recorded audio could not be processed.";
      setError(message);
      stopStream();
    }
  }

  async function openMicrophoneSettings() {
    try {
      await openUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      );
    } catch {
      setError(
        "Open System Settings, then Privacy & Security, then Microphone, and allow NutriLog.",
      );
    }
  }

  const overlay = (
    <div className="scanner-overlay" onClick={handleClose}>
      <div className="voice-recorder-card" onClick={(e) => e.stopPropagation()}>
        <div className="voice-recorder-title">Speak your food entry</div>
        <div className="voice-recorder-copy">
          Try something like “log two bananas for breakfast” or “chicken burrito bowl for lunch”.
        </div>

        <div className={`voice-recorder-orb ${recording ? "recording" : ""}`}>
          <span>{recording ? "REC" : "MIC"}</span>
        </div>

        <div className="scanner-controls">
          {!recording ? (
            <button
              className="voice-recorder-btn"
              onClick={handleStartRecording}
              disabled={!microphoneReady || finishing || microphoneBlocked}
            >
              Start Recording
            </button>
          ) : (
            <button
              className="voice-recorder-btn stop"
              onClick={handleStopRecording}
              disabled={finishing}
            >
              Stop & Transcribe
            </button>
          )}

          {microphoneBlocked && (
            <button className="scanner-close-btn" onClick={openMicrophoneSettings}>
              Open Microphone Settings
            </button>
          )}

          <button className="scanner-close-btn" onClick={handleClose} disabled={finishing}>
            Close
          </button>
        </div>

        <div className="scanner-hint">
          {finishing
            ? "Processing your recording…"
            : microphoneReady
              ? "Your audio is captured only long enough to produce a transcript."
              : microphoneBlocked
                ? "Microphone access is currently blocked by the OS."
                : "Waiting for microphone access…"}
        </div>

        {error && <div className="scanner-error">{error}</div>}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}

async function ensureNativeMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  try {
    return await invoke<MicrophonePermissionStatus>("ensure_microphone_permission");
  } catch {
    return "unknown";
  }
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function downsampleAudio(
  samples: Float32Array,
  inputRate: number,
  outputRate: number,
) {
  if (inputRate <= 0) {
    throw new Error("The microphone reported an invalid sample rate.");
  }
  if (inputRate === outputRate) {
    return samples;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(samples.length / ratio);
  const output = new Float32Array(outputLength);
  let offset = 0;

  for (let i = 0; i < outputLength; i += 1) {
    const nextOffset = Math.min(
      Math.round((i + 1) * ratio),
      samples.length,
    );
    let total = 0;
    let count = 0;

    for (let sourceIdx = offset; sourceIdx < nextOffset; sourceIdx += 1) {
      total += samples[sourceIdx];
      count += 1;
    }

    output[i] = count > 0 ? total / count : samples[Math.min(offset, samples.length - 1)] || 0;
    offset = nextOffset;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, value, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
