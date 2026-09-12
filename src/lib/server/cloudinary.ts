import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn("⚠️ Cloudinary environment variables are not fully configured.");
}

export { cloudinary };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB, same as legacy multer limit

/** Stream a buffer to Cloudinary (legacy upload_stream pattern, promisified). */
export const uploadBufferToCloudinary = (
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
      else resolve(result);
    });
    uploadStream.end(buffer);
  });
};

/**
 * Deletion is restricted to study-material assets. The prefix check lives HERE
 * (not in the route) so no caller can bypass it.
 */
export const deleteMaterialAsset = async (publicId: string) => {
  const decodedPublicId = decodeURIComponent(String(publicId || ""));
  if (!decodedPublicId.startsWith("campus-connect/materials/")) {
    return { allowed: false as const };
  }
  const result = await cloudinary.uploader.destroy(decodedPublicId);
  return { allowed: true as const, result };
};
