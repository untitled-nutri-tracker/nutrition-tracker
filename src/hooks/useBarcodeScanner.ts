/**
 * useBarcodeScanner — Platform-aware barcode scanning hook.
 *
 * Desktop:  Uses @zxing/library with getUserMedia (camera in the webview).
 * Mobile:   Will use @tauri-apps/plugin-barcode-scanner (native camera).
 *
 * The hook exposes a single API regardless of platform.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import type { BrowserMultiFormatReader } from "@zxing/library";
import { attachCameraStream, stopMediaStream, stopVideoElementStream } from "./cameraSession";


/* ------------------------------------------------------------------ */
/*  Platform detection                                                 */
/* ------------------------------------------------------------------ */
const IS_MOBILE =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  (window as any).__TAURI_INTERNALS__?.isMobile === true;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface ScanResult {
  barcode: string;
  format: string;
}

export type CameraPermission = "granted" | "denied" | "prompt" | null;

export interface UseBarcodeScanner {
  /** Attach the scanner to a <video> element and start continuous decode. */
  startScan: (videoEl: HTMLVideoElement) => Promise<void>;
  /** Stop scanning and release the camera. */
  stopScan: () => void;
  /** True while the camera is active and scanning. */
  isScanning: boolean;
  /** Last detected barcode result (reset on each new scan session). */
  result: ScanResult | null;
  /** Human-readable error string, or null. */
  error: string | null;
  /** Current camera permission state. */
  cameraPermission: CameraPermission;
  /** Available video input devices. */
  devices: MediaDeviceInfo[];
  /** Currently selected device ID. */
  selectedDeviceId: string | null;
  /** Switch to a different camera. */
  selectDevice: (deviceId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */
export function useBarcodeScanner(
  onDetected?: (result: ScanResult) => void
): UseBarcodeScanner {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermission>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const onDetectedRef = useRef(onDetected);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selectedDeviceIdRef = useRef<string | null>(null);
  // ★ We own this stream ref — the single source of truth for camera cleanup
  const streamRef = useRef<MediaStream | null>(null);

  // Keep callback ref current without re-triggering effects.
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  /* ---- enumerate cameras ---- */
  useEffect(() => {
    if (IS_MOBILE) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((allDevs: MediaDeviceInfo[]) => {
        const videoDevs = allDevs.filter((d) => d.kind === "videoinput");
        setDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceIdRef.current) {
          setSelectedDeviceId(videoDevs[0].deviceId);
          selectedDeviceIdRef.current = videoDevs[0].deviceId;
        }
      })
      .catch(() => {
        /* ignore — devices will be empty */
      });
  }, []);

  /* ---- Kill all camera tracks (guaranteed cleanup) ---- */
  const killAllTracks = useCallback(() => {
    // 1. Stop tracks from our stored stream ref (primary source of truth)
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }

    // 2. Also check the video element as a fallback
    stopVideoElementStream(videoRef.current);

    if (import.meta.env.DEV) console.log("[BarcodeScanner] All camera tracks killed");
  }, []);

  /* ---- startScan (desktop — manage stream ourselves) ---- */
  const startScanDesktop = useCallback(
    async (videoEl: HTMLVideoElement) => {
      setError(null);
      setResult(null);
      videoRef.current = videoEl;

      // Check camera permission
      try {
        const permStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        setCameraPermission(permStatus.state as CameraPermission);
        if (permStatus.state === "denied") {
          setError(
            "Camera access denied. Please allow camera access for barcode and food photo scanning."
          );
          return;
        }
      } catch {
        // permissions API may not support "camera" — proceed anyway
      }

      try {
        // ★ Step 1: Get the camera stream OURSELVES so we own it
        const deviceToUse = selectedDeviceIdRef.current;
        if (import.meta.env.DEV) console.log("[BarcodeScanner] Requesting camera:", deviceToUse || "default");

        const constraints: MediaStreamConstraints = {
          video: deviceToUse
            ? { deviceId: { exact: deviceToUse } }
            : { facingMode: "environment" },
          audio: false,
        };

        const stream = await attachCameraStream(videoEl, constraints);
        streamRef.current = stream; // ★ Store it so we can always kill it

        if (import.meta.env.DEV) console.log("[BarcodeScanner] Camera stream active. Tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}:${t.readyState}`));

        // ★ Step 3: Start ZXing decode loop on the existing stream
        const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/library");
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;
        setIsScanning(true);
        setCameraPermission("granted");

        // Refetch devices now that permission is granted to update the dropdown list
        if (!IS_MOBILE) {
          navigator.mediaDevices.enumerateDevices().then((allDevs) => {
            const videoDevs = allDevs.filter((d) => d.kind === "videoinput");
            setDevices(videoDevs);
          }).catch(() => {});
        }

        let scanAttempts = 0;

        reader.decodeFromStream(
          stream,
          videoEl,
          (res, err) => {
            scanAttempts++;

            if (scanAttempts % 60 === 0 && import.meta.env.DEV) {
              console.log(`[BarcodeScanner] Scanning... (attempt ${scanAttempts})`);
            }

            if (res) {
              const scanResult: ScanResult = {
                barcode: res.getText(),
                format: BarcodeFormat[res.getBarcodeFormat()],
              };
              if (import.meta.env.DEV) console.log("[BarcodeScanner] ✅ DETECTED:", scanResult.barcode, "format:", scanResult.format);
              setResult(scanResult);
              setIsScanning(false);
              onDetectedRef.current?.(scanResult);

              // Stop ZXing decode loop (but DON'T kill the stream here — 
              // the component's close handler will do that)
              try { reader.reset(); } catch { /* ignore */ }
              readerRef.current = null;
            }

            if (err) {
              const errName = (err as any)?.name || "";
              const errMsg = (err as any)?.message || String(err);
              if (errName !== "NotFoundException" && !errMsg.includes("No MultiFormat")) {
                console.warn("[BarcodeScanner] Decode error:", errName, errMsg);
              }
            }
          }
        );

        if (import.meta.env.DEV) console.log("[BarcodeScanner] Decode loop started");
      } catch (e: any) {
        const errName = e?.name || "";
        const msg = e?.message ?? String(e);
        console.error("[BarcodeScanner] Failed to start:", errName, msg);

        // Ignore AbortError caused by rapid component unmount/remount
        if (errName === "AbortError" || msg.includes("operation was aborted")) {
          return;
        }

        if (
          msg.includes("NotAllowedError") ||
          msg.includes("Permission denied")
        ) {
          setCameraPermission("denied");
          setError("Camera access denied. Please grant permission for barcode and food photo scanning, then retry.");
        } else if (msg.includes("NotFoundError") || msg.includes("NotReadableError")) {
          setError(
            "No camera detected or camera is in use. Use manual barcode entry."
          );
        } else {
          setError(`Camera error: ${msg}`);
        }
        setIsScanning(false);
      }
    },
    []
  );

  /* ---- startScan (mobile — Tauri plugin, deferred) ---- */
  const startScanMobile = useCallback(async (_videoEl: HTMLVideoElement) => {
    setError(null);
    setResult(null);
    setIsScanning(true);

    try {
      const pluginName = "@tauri-apps/plugin-barcode-scanner";
      const mod: any = await import(/* @vite-ignore */ pluginName);
      const scanRes = await mod.scan({
        windowed: true,
        formats: ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128"],
      });

      const scanResult: ScanResult = {
        barcode: scanRes.content,
        format: scanRes.format,
      };
      setResult(scanResult);
      onDetectedRef.current?.(scanResult);
    } catch (e: any) {
      setError(e?.message ?? "Barcode scan failed");
    } finally {
      setIsScanning(false);
    }
  }, []);

  /* ---- stopScan ---- */
  const stopScan = useCallback(() => {
    // 1. Stop ZXing decode loop
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch { /* ignore */ }
      readerRef.current = null;
    }

    // 2. Kill camera tracks (our owned stream)
    killAllTracks();

    setIsScanning(false);
  }, [killAllTracks]);

  /* ---- selectDevice ---- */
  const selectDevice = useCallback(
    (deviceId: string) => {
      if (import.meta.env.DEV) console.log("[BarcodeScanner] Switching to device:", deviceId);
      setSelectedDeviceId(deviceId);
      selectedDeviceIdRef.current = deviceId;

      // Restart scan with the new device
      if (videoRef.current) {
        // Stop current scan + kill stream
        if (readerRef.current) {
          try { readerRef.current.reset(); } catch { /* ignore */ }
          readerRef.current = null;
        }
        killAllTracks();

        const vid = videoRef.current;
        setTimeout(() => {
          startScanDesktop(vid);
        }, 200);
      }
    },
    [killAllTracks, startScanDesktop]
  );

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (import.meta.env.DEV) console.log("[BarcodeScanner] Unmounting — cleaning up");
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch { /* ignore */ }
        readerRef.current = null;
      }
      // Kill any surviving tracks
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
      }
      stopVideoElementStream(videoRef.current);
    };
  }, []);

  return {
    startScan: IS_MOBILE ? startScanMobile : startScanDesktop,
    stopScan,
    isScanning,
    result,
    error,
    cameraPermission,
    devices,
    selectedDeviceId,
    selectDevice,
  };
}
