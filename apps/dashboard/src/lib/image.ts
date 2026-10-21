/** Shrinks a photo to at most `maxSide` px and re-encodes it as WebP; images are the main cause of slow menus. */
export async function compressImage(file: File, maxSide = 1000, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/webp', quality),
  );
}

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

/** Image upload goes to Cloudinary's free plan (Firebase Storage needs the paid plan). Off until configured. */
export const imageUploadEnabled = !!CLOUD && !!PRESET;

/** Uploads to an unsigned Cloudinary preset and returns the public https link. */
export async function uploadImage(blob: Blob, folder: string): Promise<string> {
  if (!CLOUD || !PRESET) throw new Error('image upload is not configured');
  const body = new FormData();
  body.append('file', blob);
  body.append('upload_preset', PRESET);
  body.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return (await res.json()).secure_url as string;
}
