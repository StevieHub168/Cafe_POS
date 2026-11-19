/** A photo from a phone camera is often 3-10 MB; the longest side is cut down to this many pixels (plenty for a product photo). */
export const CAMERA_MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Makes a camera photo small enough to upload: scales it down (longest side <= 1600 px), turns it upright using the
 * camera's rotation info, and saves it as a JPEG.
 *
 * Never throws: if the browser cannot do it, or the photo is already small and saving it again would only make it
 * bigger, the original file is returned unchanged.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, CAMERA_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    // A photo that was already small and would only grow when saved again is left alone. One that had to be scaled
    // down is always replaced, so the 1600 px limit holds.
    if (scale === 1 && blob.size >= file.size) return file;

    return new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
