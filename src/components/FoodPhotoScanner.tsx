import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

interface FoodPhotoPayload {
  imageBase64: string;
  mimeType: string;
}

interface FoodPhotoScannerProps {
  onPhotoCaptured: (photo: FoodPhotoPayload) => void;
  onClose: () => void;
}

export default function FoodPhotoScanner({
  onPhotoCaptured,
  onClose,
}: FoodPhotoScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const prefersPickerCapture = useMemo(() => prefersFileCapture(), []);
  const [livePreviewUnavailable, setLivePreviewUnavailable] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<CameraPermissionStatus>("unknown");
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const usePickerCapture = prefersPickerCapture || livePreviewUnavailable;
  const permissionBlocked = permissionStatus === "denied" || permissionStatus === "restricted";
  const frameAspectRatio = displayAspectForVideo(videoAspectRatio);
  const frameStyle = {
    "--food-photo-aspect": String(frameAspectRatio),
  } as CSSProperties;

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }

  function retryLivePreview() {
    setError(null);
    setPermissionStatus("unknown");
    setLivePreviewUnavailable(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (usePickerCapture) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setLivePreviewUnavailable(true);
        return;
      }

      setError(null);
      try {
        const nativePermission = await ensureNativeCameraPermission();
        if (cancelled) return;
        setPermissionStatus(nativePermission);
        if (nativePermission === "denied" || nativePermission === "restricted") {
          setLivePreviewUnavailable(true);
          setError(null);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch {
        if (cancelled) return;
        setLivePreviewUnavailable(true);
        setPermissionStatus("unknown");
        setError(null);
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [usePickerCapture]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function handleClose() {
    stopCamera();
    onClose();
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError("Camera is not ready yet. Try again in a moment.");
      return;
    }

    const sourceWidth = video.videoWidth || 1024;
    const sourceHeight = video.videoHeight || 768;
    const sourceRect = sourceRectForAspect(sourceWidth, sourceHeight, frameAspectRatio);
    const canvas = document.createElement("canvas");
    canvas.width = sourceRect.width;
    canvas.height = sourceRect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not capture a frame from the camera.");
      return;
    }
    ctx.drawImage(
      video,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      sourceRect.width,
      sourceRect.height,
    );
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    stopCamera();
    onPhotoCaptured({
      imageBase64: stripDataUrl(dataUrl),
      mimeType: "image/jpeg",
    });
  }

  function handleVideoMetadata() {
    const video = videoRef.current;
    const trackSettings = streamRef.current?.getVideoTracks()[0]?.getSettings();
    const width = video?.videoWidth || trackSettings?.width;
    const height = video?.videoHeight || trackSettings?.height;
    if (!width || !height) return;
    setVideoAspectRatio(width / height);
  }

  async function openCameraSettings() {
    try {
      await openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera");
    } catch {
      setError("Open System Settings, then Privacy & Security, then Camera, and allow NutriLog.");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      stopCamera();
      onPhotoCaptured({
        imageBase64: stripDataUrl(dataUrl),
        mimeType: file.type,
      });
      e.target.value = "";
    };
    reader.onerror = () => setError("Could not read the selected image.");
    reader.readAsDataURL(file);
  }

  const overlay = (
    <div className="fixed inset-0 box-border p-0 z-[2147483000] flex flex-col items-center justify-center [animation:scanner-fade-in_0.2s_ease-out]" onClick={handleClose}>
      <div className="bg-black flex h-[100dvh] w-[100dvw] fixed inset-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative flex-1 h-full w-full overflow-hidden border-[border-color:rgba(80,200,120,0.45)]"
          style={frameStyle}
        >
          {usePickerCapture ? (
            <div className="flex items-center justify-center w-full h-full bg-black/72 text-white text-base leading-relaxed text-center p-6">
              <div>
                <div>
                  {permissionBlocked
                    ? "Camera permission is blocked by macOS."
                    : prefersPickerCapture
                      ? "Use the camera picker for a single food item, or choose an existing photo."
                      : "Live camera preview is unavailable here. Choose a food photo from your device."}
                </div>
                {permissionBlocked && (
                  <div className="text-white/74 text-[0.9rem] mt-2">
                    Allow NutriLog in System Settings, then retry the live camera.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={handleVideoMetadata}
              onCanPlay={handleVideoMetadata}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute top-[18px] left-1/2 -translate-x-1/2 w-max max-w-[min(520px,calc(100vw-32px))] rounded-lg px-2.5 py-2 bg-black/55 text-white/90 text-xs text-center">
            Place one food item in the frame
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-[2] bg-gradient-to-b from-transparent via-black/35 to-black/58 pt-16 px-4 pb-[18px] grid gap-2.5 justify-items-center">
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            {!usePickerCapture && (
              <button
                className="px-5 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/16 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                onClick={handleCapture}
                disabled={!cameraReady}
              >
                Take Photo
              </button>
            )}
            <button className="px-5 py-2.5 rounded-xl border border-sky-500/35 bg-sky-500/16 text-white font-semibold text-sm hover:bg-sky-500/24 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
              {prefersPickerCapture ? "Use Camera" : "Choose Photo"}
            </button>
            {permissionBlocked && (
              <>
                <button className="px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white font-semibold text-sm hover:bg-white/16 transition-colors cursor-pointer" onClick={openCameraSettings}>
                  Open Camera Settings
                </button>
                <button className="px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white font-semibold text-sm hover:bg-white/16 transition-colors cursor-pointer" onClick={retryLivePreview}>
                  Retry Live Camera
                </button>
              </>
            )}
            <button className="px-5 py-2.5 rounded-xl border border-red-500/35 bg-red-500/12 text-white font-semibold text-sm hover:bg-red-500/22 transition-colors cursor-pointer" onClick={handleClose}>
              Close
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>

          <div className="mt-3 text-xs text-white/50 text-center">
            Photos are analyzed ephemerally and are not stored by NutriLog.
          </div>

          {error && (
            <div className="mt-2 px-3.5 py-2.5 rounded-[10px] border border-red-500/35 bg-red-500/10 text-sm text-white/90">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}

type CameraPermissionStatus = "granted" | "denied" | "restricted" | "unsupported" | "unknown";

function displayAspectForVideo(aspectRatio: number) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return 16 / 9;
  }
  return aspectRatio;
}

function sourceRectForAspect(width: number, height: number, targetAspect: number) {
  const sourceAspect = width / height;
  if (Math.abs(sourceAspect - targetAspect) < 0.01) {
    return { x: 0, y: 0, width, height };
  }
  if (sourceAspect > targetAspect) {
    const croppedWidth = Math.round(height * targetAspect);
    return {
      x: Math.max(0, Math.round((width - croppedWidth) / 2)),
      y: 0,
      width: croppedWidth,
      height,
    };
  }

  const croppedHeight = Math.round(width / targetAspect);
  return {
    x: 0,
    y: Math.max(0, Math.round((height - croppedHeight) / 2)),
    width,
    height: croppedHeight,
  };
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function prefersFileCapture(): boolean {
  if (typeof navigator === "undefined") return true;
  const userAgent = navigator.userAgent || "";
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isIpadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isMobileUa || isIpadOs;
}

async function ensureNativeCameraPermission(): Promise<"granted" | "denied" | "restricted" | "unsupported"> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return "unsupported";
  }

  try {
    const status = await invoke<string>("ensure_camera_permission");
    if (status === "granted" || status === "denied" || status === "restricted") {
      return status;
    }
  } catch {
    // Older dev builds may not have the native helper yet; let getUserMedia try.
  }

  return "unsupported";
}
