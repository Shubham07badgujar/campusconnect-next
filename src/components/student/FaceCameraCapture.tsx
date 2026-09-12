"use client";

import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import "@tensorflow/tfjs";

const MODEL_BASE_URL =
  process.env.NEXT_PUBLIC_FACE_API_MODEL_URL || "/models";

// Eye-aspect-ratio thresholds for blink detection: the ratio drops sharply
// while the eyelids are closed and recovers when they reopen.
const EAR_CLOSED_THRESHOLD = 0.21;
const EAR_OPEN_THRESHOLD = 0.26;
const LIVENESS_TIMEOUT_MS = 15000;
const LIVENESS_FRAME_COUNT = 3;
const LIVENESS_FRAME_GAP_MS = 900;

let modelsPromise: any = null;

const loadModels = async () => {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE_URL),
    ]);
  }

  return modelsPromise;
};

const stopStream = (stream: any) => {
  if (!stream) return;
  stream.getTracks().forEach((track: any) => track.stop());
};

const pointDistance = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);

const eyeAspectRatio = (eyePoints: any) => {
  if (!Array.isArray(eyePoints) || eyePoints.length !== 6) {
    return 1;
  }

  const vertical =
    pointDistance(eyePoints[1], eyePoints[5]) +
    pointDistance(eyePoints[2], eyePoints[4]);
  const horizontal = pointDistance(eyePoints[0], eyePoints[3]);
  return horizontal ? vertical / (2 * horizontal) : 1;
};

const detectorOptions = () =>
  new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.45,
  });

export default function FaceCameraCapture({
  disabled,
  buttonLabel = "Capture Face",
  onDescriptor,
  mode = "single",
}: any) {
  const videoRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const activeRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (!videoRef.current) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        await loadModels();
        setCameraReady(true);
      } catch (cameraError: any) {
        setError(cameraError.message || "Unable to access camera.");
      }
    };

    start();

    return () => {
      activeRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const detectSingleFrame = async (withDescriptor: any) => {
    let query: any = faceapi
      .detectAllFaces(videoRef.current, detectorOptions())
      .withFaceLandmarks();
    if (withDescriptor) {
      query = query.withFaceDescriptors();
    }
    return query;
  };

  const captureSingle = async () => {
    const detections = await detectSingleFrame(true);

    if (!Array.isArray(detections) || detections.length === 0) {
      throw new Error("No face detected. Ensure your face is visible.");
    }

    if (detections.length > 1) {
      throw new Error("Multiple faces detected. Only one face is allowed.");
    }

    const [match] = detections;
    const descriptor = Array.from(match.descriptor || []);
    if (descriptor.length !== 128) {
      throw new Error("Face descriptor extraction failed.");
    }

    return { descriptor, descriptors: [descriptor], livenessPassed: false };
  };

  const captureLiveness = async () => {
    const descriptors: any[] = [];
    const deadline = Date.now() + LIVENESS_TIMEOUT_MS;
    let lastDescriptorAt = 0;
    let eyesClosedSeen = false;
    let blinkDetected = false;

    setStatus("Look at the camera and blink once...");

    while (activeRef.current && Date.now() < deadline) {
      const collectDescriptor =
        descriptors.length < LIVENESS_FRAME_COUNT &&
        Date.now() - lastDescriptorAt >= LIVENESS_FRAME_GAP_MS;

      const detections = await detectSingleFrame(collectDescriptor);

      if (!Array.isArray(detections) || detections.length === 0) {
        setStatus("No face detected. Keep your face inside the frame...");
        continue;
      }

      if (detections.length > 1) {
        setStatus("Multiple faces detected. Only one face is allowed...");
        continue;
      }

      const [detection] = detections;
      const landmarks = detection.landmarks;
      const ear = Math.min(
        eyeAspectRatio(landmarks?.getLeftEye?.() || []),
        eyeAspectRatio(landmarks?.getRightEye?.() || []),
      );

      if (ear < EAR_CLOSED_THRESHOLD) {
        eyesClosedSeen = true;
      } else if (eyesClosedSeen && ear > EAR_OPEN_THRESHOLD) {
        blinkDetected = true;
      }

      if (collectDescriptor && detection.descriptor) {
        const descriptor = Array.from(detection.descriptor);
        if (descriptor.length === 128) {
          descriptors.push(descriptor);
          lastDescriptorAt = Date.now();
        }
      }

      setStatus(
        blinkDetected
          ? `Blink detected. Capturing frames (${descriptors.length}/${LIVENESS_FRAME_COUNT})...`
          : `Blink once to prove liveness (${descriptors.length}/${LIVENESS_FRAME_COUNT} frames)...`,
      );

      if (blinkDetected && descriptors.length >= LIVENESS_FRAME_COUNT) {
        break;
      }
    }

    if (!activeRef.current) {
      throw new Error("Capture cancelled.");
    }

    if (!blinkDetected) {
      throw new Error(
        "Liveness check failed: no blink detected. Please retry and blink naturally.",
      );
    }

    if (descriptors.length < 2) {
      throw new Error(
        "Liveness check failed: not enough face frames captured. Please retry.",
      );
    }

    return {
      descriptor: descriptors[0],
      descriptors,
      livenessPassed: true,
    };
  };

  const captureFace = async () => {
    if (!videoRef.current) return;

    setCapturing(true);
    setError("");
    setStatus("");
    activeRef.current = true;

    try {
      const result =
        mode === "liveness" ? await captureLiveness() : await captureSingle();

      setStatus(
        mode === "liveness"
          ? "Liveness capture complete."
          : "Face captured.",
      );
      onDescriptor?.(result);
    } catch (captureError: any) {
      setError(captureError.message || "Face capture failed.");
      setStatus("");
      onDescriptor?.(null);
    } finally {
      activeRef.current = false;
      setCapturing(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700">Face Camera</p>
      <div className="mx-auto mt-3 aspect-[3/4] w-56 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 sm:w-64">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
      </div>
      <button
        type="button"
        disabled={disabled || !cameraReady || capturing}
        onClick={captureFace}
        className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {capturing ? "Processing..." : buttonLabel}
      </button>
      {status ? <p className="mt-2 text-xs text-slate-600">{status}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {!(typeof window !== "undefined" && window.isSecureContext) ? (
        <p className="mt-2 text-xs text-amber-700">
          Use HTTPS for reliable camera and biometric APIs.
        </p>
      ) : null}
    </div>
  );
}
