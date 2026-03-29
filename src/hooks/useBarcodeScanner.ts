/**
 * useBarcodeScanner — Platform-aware barcode scanning hook.
 *
 * Desktop:  Uses @zxing/browser with getUserMedia (camera in the webview).
 * Mobile:   Will use @tauri-apps/plugin-barcode-scanner (native camera).
 *
 * The hook exposes a single API regardless of platform.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";


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
/*  Supported barcode formats (food barcodes)                          */
/* ------------------------------------------------------------------ */
const FOOD_FORMATS = new Map<DecodeHintType, any>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ],
  ],
]);

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
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      })
      .catch(() => {
        /* ignore — devices will be empty */
      });
  }, []);

  /* ---- startScan (desktop — @zxing/browser) ---- */
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
            "Camera access denied. Please allow camera access in your browser settings."
          );
          return;
        }
      } catch {
        // permissions API may not support "camera" — proceed anyway
      }

      try {
        const reader = new BrowserMultiFormatReader(FOOD_FORMATS);
        readerRef.current = reader;
        setIsScanning(true);
        setCameraPermission("granted");

        await reader.decodeFromVideoDevice(
          selectedDeviceId || null,
          videoEl,
          (res, err) => {
            if (res) {
              const scanResult: ScanResult = {
                barcode: res.getText(),
                format: BarcodeFormat[res.getBarcodeFormat()],
              };
              setResult(scanResult);
              setIsScanning(false);
              onDetectedRef.current?.(scanResult);

              // Stop scanning after successful decode
              reader.reset();
              readerRef.current = null;
            }
            // err fires continuously while scanning — only surface real errors
            if (err && !(err as any).message?.includes("No MultiFormat")) {
              // Silently ignore "not found yet" errors
            }
          }
        );
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (
          msg.includes("NotAllowedError") ||
          msg.includes("Permission denied")
        ) {
          setCameraPermission("denied");
          setError("Camera access denied. Please grant permission and retry.");
        } else if (msg.includes("NotFoundError")) {
          setError(
            "No camera detected on this device. Use manual barcode entry instead."
          );
        } else {
          setError(`Camera error: ${msg}`);
        }
        setIsScanning(false);
      }
    },
    [selectedDeviceId]
  );

  /* ---- startScan (mobile — Tauri plugin, deferred) ---- */
  const startScanMobile = useCallback(async (_videoEl: HTMLVideoElement) => {
    setError(null);
    setResult(null);
    setIsScanning(true);

    try {
      // Dynamic import — only called on mobile where the plugin is installed.
      // Using a variable so Rollup/Vite can't statically resolve the module at build time.
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
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  /* ---- selectDevice ---- */
  const selectDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      // If currently scanning, restart with new device
      if (isScanning && videoRef.current) {
        stopScan();
        setTimeout(() => {
          if (videoRef.current) {
            (IS_MOBILE ? startScanMobile : startScanDesktop)(videoRef.current);
          }
        }, 100);
      }
    },
    [isScanning, stopScan, startScanDesktop, startScanMobile]
  );

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
      }
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
