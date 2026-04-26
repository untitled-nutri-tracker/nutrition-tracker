/**
 * BarcodeScanner — Camera-based barcode scanning component.
 *
 * Opens as a full-screen overlay with a live camera viewfinder.
 * Continuously scans for barcodes and calls `onBarcodeDetected`
 * when a valid barcode is found.
 */
import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBarcodeScanner, ScanResult } from "../hooks/useBarcodeScanner";

interface BarcodeScannerProps {
  /** Called with the decoded barcode and format when a scan succeeds. */
  onBarcodeDetected: (barcode: string, format: string) => void;
  /** Close the scanner overlay. */
  onClose: () => void;
}

export default function BarcodeScanner({
  onBarcodeDetected,
  onClose,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showFlash, setShowFlash] = useState(false);

  const handleDetected = (result: ScanResult) => {
    // Show success flash
    setShowFlash(true);
    setTimeout(() => {
      onBarcodeDetected(result.barcode, result.format);
    }, 400);
  };

  const {
    startScan,
    stopScan,
    isScanning,
    error,
    devices,
    selectedDeviceId,
    selectDevice,
  } = useBarcodeScanner(handleDetected);

  /** Kill the camera stream by stopping all tracks on the video element. */
  const killCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => {
        track.stop();
        console.log("[BarcodeScanner] ✅ Killed track:", track.kind, track.label);
      });
      videoRef.current.srcObject = null;
    }
  };

  // Start scanning when the overlay mounts
  useEffect(() => {
    if (videoRef.current) {
      startScan(videoRef.current);
    }
    return () => {
      stopScan();
      killCamera();
    };
  }, []);

  // Handle ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopScan();
        killCamera();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stopScan, onClose]);

  const handleClose = () => {
    stopScan();
    killCamera();
    onClose();
  };

  const overlay = (
    <div className="fixed inset-0 box-border p-0 z-[2147483000] flex flex-col items-center justify-center [animation:scanner-fade-in_0.2s_ease-out]" onClick={handleClose}>
      <div className="bg-black flex h-[100dvh] w-[100dvw] fixed inset-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1 h-full w-full overflow-hidden border-[border-color:rgba(80,200,120,0.45)]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Scanning line animation */}
          {isScanning && !showFlash && (
            <div className="absolute left-[5%] right-[5%] h-0.5 bg-gradient-to-r from-transparent via-indigo-500/90 via-cyan-400/90 to-transparent shadow-[0_0_12px_rgba(124,92,255,0.6)] rounded-sm [animation:scan-sweep_2s_ease-in-out_infinite]" />
          )}

          {/* Success flash */}
          {showFlash && <div className="absolute inset-0 bg-emerald-400/25 [animation:success-flash_0.5s_ease-out_forwards] pointer-events-none" />}

          <div className="absolute left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+18px)] w-max max-w-[min(520px,calc(100vw-32px))] rounded-lg px-2.5 py-2 bg-black/55 text-white/90 text-xs text-center">
            Center the barcode in frame
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-[2] bg-gradient-to-b from-transparent via-black/35 to-black/58 pt-16 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] grid gap-2.5 justify-items-center">
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            {devices.length > 1 && (
              <select
                className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/5 text-white/90 text-xs max-w-[220px]"
                value={selectedDeviceId ?? ""}
                onChange={(e) => selectDevice(e.target.value)}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            <button
              className="px-5 py-2.5 rounded-xl border border-red-500/35 bg-red-500/12 text-white font-semibold text-sm hover:bg-red-500/22 transition-colors cursor-pointer"
              onClick={handleClose}
            >
              Close
            </button>
          </div>

          <div className="mt-3 text-xs text-white/50 text-center">
            Hold steady until a barcode is detected · Press ESC to cancel
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
