/**
 * BarcodeScanner — Camera-based barcode scanning component.
 *
 * Opens as a full-screen overlay with a live camera viewfinder.
 * Continuously scans for barcodes and calls `onBarcodeDetected`
 * when a valid barcode is found.
 */
import { useRef, useEffect, useState } from "react";
import { useBarcodeScanner, ScanResult } from "../hooks/useBarcodeScanner";
import "../styles/barcode-scanner.css";

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

  return (
    <div className="scanner-overlay" onClick={handleClose}>
      <div
        className="scanner-video-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />

        {/* Scanning line animation */}
        {isScanning && !showFlash && <div className="scanner-line" />}

        {/* Success flash */}
        {showFlash && <div className="scanner-success-flash" />}
      </div>

      {/* Controls */}
      <div className="scanner-controls" onClick={(e) => e.stopPropagation()}>
        {/* Camera selector */}
        {devices.length > 1 && (
          <select
            className="scanner-device-select"
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

        <button className="scanner-close-btn" onClick={handleClose}>
          ✕ Close
        </button>
      </div>

      {/* Hint text */}
      <div className="scanner-hint">
        Hold a barcode in front of the camera · Press ESC to cancel
      </div>

      {/* Error */}
      {error && (
        <div className="scanner-error" onClick={(e) => e.stopPropagation()}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
