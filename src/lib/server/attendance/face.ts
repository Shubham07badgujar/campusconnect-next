// Face descriptor math — ported verbatim from the legacy monolith.
import {
  FACE_DESCRIPTOR_LENGTH,
  FACE_MATCH_DISTANCE_THRESHOLD,
} from "@/lib/server/constants";

export const normalizeFaceDescriptor = (descriptor: unknown = []): number[] => {
  if (!Array.isArray(descriptor)) {
    return [];
  }

  const normalized = descriptor
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (normalized.length !== FACE_DESCRIPTOR_LENGTH) {
    return [];
  }

  return normalized;
};

export const euclideanDistance = (
  leftDescriptor: number[] = [],
  rightDescriptor: number[] = [],
): number => {
  if (
    !Array.isArray(leftDescriptor) ||
    !Array.isArray(rightDescriptor) ||
    leftDescriptor.length !== rightDescriptor.length ||
    leftDescriptor.length === 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;
  for (let i = 0; i < leftDescriptor.length; i += 1) {
    sum += (leftDescriptor[i] - rightDescriptor[i]) ** 2;
  }

  return Math.sqrt(sum);
};

export const buildFaceConfidenceScore = (distance: number): number => {
  if (!Number.isFinite(distance)) return 0;
  const score = Math.max(0, 1 - distance / FACE_MATCH_DISTANCE_THRESHOLD);
  return Number(score.toFixed(4));
};
