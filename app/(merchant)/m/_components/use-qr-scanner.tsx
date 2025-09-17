"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

type ScannerStatus =
  | "idle"
  | "requesting_permission"
  | "active"
  | "permission_denied"
  | "no_camera"
  | "error"
  | "stopped";

type QrDetection = {
  value: string;
  timestamp: number;
};

type UseQrScannerOptions = {
  enabled?: boolean;
  cooldownMs?: number;
  onDetected?: (value: string) => void;
};

type UseQrScannerResult = {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  error: string | null;
  detection: QrDetection | null;
  isActive: boolean;
  isRequestingPermission: boolean;
  isCameraSupported: boolean;
  hasPermission: boolean | null;
  start: () => void;
  stop: () => void;
};

function isSecureContextAvailable() {
  if (typeof window === "undefined") {
    return false;
  }

  // Some browsers may not expose isSecureContext; assume false if unavailable.
  if (typeof window.isSecureContext === "boolean") {
    return window.isSecureContext;
  }

  return false;
}

export function useQrScanner({
  enabled = true,
  cooldownMs = 3000,
  onDetected,
}: UseQrScannerOptions = {}): UseQrScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [detection, setDetection] = useState<QrDetection | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isCameraSupported, setIsCameraSupported] = useState<boolean>(true);
  const detectionGateRef = useRef<{ value: string; timestamp: number } | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    return () => {
      canvasRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    detectionGateRef.current = null;
    setDetection(null);
    setStatus((current) => (current === "idle" ? current : "stopped"));
  }, []);

  useEffect(() => stop, [stop]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, width, height);
          try {
            const imageData = context.getImageData(0, 0, width, height);
            const result = jsQR(imageData.data, width, height, {
              inversionAttempts: "dontInvert",
            });

            if (result && typeof result.data === "string" && result.data.trim()) {
              const trimmed = result.data.trim();
              const now = Date.now();
              const gate = detectionGateRef.current;

              if (!gate || gate.value !== trimmed || now - gate.timestamp >= cooldownMs) {
                detectionGateRef.current = { value: trimmed, timestamp: now };
                setDetection({ value: trimmed, timestamp: now });
                onDetected?.(trimmed);
              }
            }
          } catch (frameError) {
            // If reading pixels fails, surface the error once and stop the loop to avoid spamming.
            if (frameError instanceof Error) {
              setError(frameError.message);
            } else {
              setError("Failed to decode camera frame.");
            }
            setStatus("error");
            stop();
            return;
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [cooldownMs, onDetected, stop]);

  const start = useCallback(async () => {
    if (streamRef.current || status === "requesting_permission") {
      return;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if (!isSecureContextAvailable()) {
      setStatus("error");
      setError("Camera access requires a secure (https) context.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsCameraSupported(false);
      setStatus("no_camera");
      setError("Camera access is not supported on this device.");
      return;
    }

    setIsCameraSupported(true);
    setStatus("requesting_permission");
    setError(null);
    setHasPermission(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const video = videoRef.current;
      streamRef.current = stream;

      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;

        try {
          await video.play();
        } catch (playError) {
          // If autoplay fails, surface the error but keep the stream alive.
          if (playError instanceof Error) {
            setError(playError.message);
          } else {
            setError("The camera stream is ready. Tap to start playback.");
          }
        }
      }

      setHasPermission(true);
      setStatus("active");
      animationFrameRef.current = requestAnimationFrame(processFrame);
    } catch (mediaError) {
      stop();

      if (mediaError instanceof DOMException) {
        if (mediaError.name === "NotAllowedError" || mediaError.name === "PermissionDeniedError") {
          setStatus("permission_denied");
          setHasPermission(false);
          setError("Camera permission was denied.");
          return;
        }

        if (mediaError.name === "NotFoundError" || mediaError.name === "DevicesNotFoundError") {
          setStatus("no_camera");
          setError("No compatible camera was found.");
          return;
        }

        setStatus("error");
        setError(mediaError.message || "Unable to access the camera.");
        return;
      }

      setStatus("error");
      setError(mediaError instanceof Error ? mediaError.message : "Unable to access the camera.");
    }
  }, [processFrame, status, stop]);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  const result = useMemo<UseQrScannerResult>(
    () => ({
      videoRef,
      status,
      error,
      detection,
      isActive: status === "active",
      isRequestingPermission: status === "requesting_permission",
      isCameraSupported,
      hasPermission,
      start,
      stop,
    }),
    [detection, error, hasPermission, isCameraSupported, start, status, stop, videoRef]
  );

  return result;
}

type QrScannerViewProps = {
  scanner: UseQrScannerResult;
  className?: string;
  disabledMessage?: string;
};

export function QrScannerView({ scanner, className, disabledMessage }: QrScannerViewProps) {
  const [isDetectionActive, setIsDetectionActive] = useState(false);

  useEffect(() => {
    if (!scanner.detection) {
      return;
    }

    setIsDetectionActive(true);

    const timeout = window.setTimeout(() => {
      setIsDetectionActive(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [scanner.detection]);

  const statusMessage = useMemo(() => {
    if (!scanner.isCameraSupported) {
      return "Camera access is not available on this device.";
    }

    if (scanner.status === "permission_denied") {
      return "Camera permission denied. Update browser settings to try again.";
    }

    if (scanner.status === "no_camera") {
      return "No camera detected. Use manual entry instead.";
    }

    if (scanner.status === "error") {
      return scanner.error ?? "Camera error. Use manual entry.";
    }

    if (scanner.status === "requesting_permission") {
      return "Waiting for camera permission…";
    }

    if (scanner.status === "stopped" || scanner.status === "idle") {
      return disabledMessage ?? "Scanner paused.";
    }

    if (isDetectionActive && scanner.detection) {
      return "QR code detected!";
    }

    return "Align the QR code within the frame.";
  }, [disabledMessage, isDetectionActive, scanner]);

  const highlightClass = isDetectionActive
    ? "border-emerald-400 shadow-[0_0_0_999px_rgba(16,185,129,0.18)]"
    : "border-white/30 shadow-[0_0_0_999px_rgba(15,23,42,0.45)]";

  const hasBlockingError =
    scanner.status === "permission_denied" || scanner.status === "no_camera" || scanner.status === "error";

  return (
    <div
      className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-inner transition ${
        className ?? ""
      }`}
    >
      <video
        ref={scanner.videoRef}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          scanner.isActive ? "opacity-100" : "opacity-30"
        }`}
        autoPlay
        playsInline
        muted
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-6">
        <div className={`h-4 w-full rounded-full bg-white/10 ${scanner.isRequestingPermission ? "animate-pulse" : "hidden"}`} />
        <div className={`relative h-full w-full max-w-sm border-2 ${highlightClass} transition-colors duration-300`}
        >
          <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-white/10" />
          <div className="absolute inset-x-6 top-6 h-1 rounded-full bg-white/20" />
          <div className="absolute inset-x-6 bottom-6 h-1 rounded-full bg-white/20" />
        </div>
        <div className="w-full rounded-xl bg-slate-950/70 px-4 py-2 text-center text-xs font-medium text-slate-100 backdrop-blur">
          {statusMessage}
        </div>
      </div>

      {hasBlockingError ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-semibold">
            {scanner.status === "permission_denied"
              ? "Camera permission denied"
              : scanner.status === "no_camera"
                ? "No camera available"
                : "Camera error"}
          </p>
          {scanner.error ? <p className="mt-2 text-xs text-slate-300">{scanner.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
