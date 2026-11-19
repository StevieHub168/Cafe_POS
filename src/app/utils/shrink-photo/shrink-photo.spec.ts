import { CAMERA_MAX_SIDE, shrinkPhoto } from './shrink-photo';

/** A real picture (noisy, so it does not compress to nothing), like a phone photo. */
async function picture(width: number, height: number, type: 'image/png' | 'image/jpeg'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  for (let x = 0; x < width; x += 8) {
    for (let y = 0; y < height; y += 8) {
      context.fillStyle = `rgb(${(x * 7 + y * 3) % 256}, ${(x * 3 + y * 11) % 256}, ${(x * y) % 256})`;
      context.fillRect(x, y, 8, 8);
    }
  }
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), type, 1));
  return new File([blob], type === 'image/png' ? 'IMG_0001.png' : 'IMG_0001.jpg', { type });
}

async function sizeOf(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

describe('shrinkPhoto (camera photos)', () => {
  it('scales a big photo down so its longest side is 1600 px, keeping the shape', async () => {
    const original = await picture(3200, 2400, 'image/png');
    const shrunk = await shrinkPhoto(original);
    expect(await sizeOf(shrunk)).toEqual({ width: CAMERA_MAX_SIDE, height: 1200 });
  });

  it('works for a tall (portrait) photo too', async () => {
    const shrunk = await shrinkPhoto(await picture(1800, 3200, 'image/png'));
    expect(await sizeOf(shrunk)).toEqual({ width: 900, height: CAMERA_MAX_SIDE });
  });

  it('gives back a smaller JPEG with a clear name', async () => {
    const original = await picture(3200, 2400, 'image/png');
    const shrunk = await shrinkPhoto(original);
    expect(shrunk.type).toBe('image/jpeg');
    expect(shrunk.name).toMatch(/^camera-\d+\.jpg$/);
    expect(shrunk.size).toBeLessThan(5 * 1024 * 1024);            // fits the upload limit
  });

  it('never makes a photo bigger than 1600 px, and does not stretch a small one', async () => {
    const original = await picture(800, 600, 'image/png');
    const shrunk = await shrinkPhoto(original);
    expect(await sizeOf(shrunk)).toEqual({ width: 800, height: 600 });
  });

  it('keeps the original when the result would not be smaller', async () => {
    const tiny = new File([await (await picture(8, 8, 'image/jpeg')).arrayBuffer()], 'tiny.jpg', { type: 'image/jpeg' });
    expect(await shrinkPhoto(tiny)).toBe(tiny);
  });

  it('gives the file back untouched when it cannot be read as a picture (never throws)', async () => {
    const broken = new File([new Uint8Array(2000)], 'broken.jpg', { type: 'image/jpeg' });
    expect(await shrinkPhoto(broken)).toBe(broken);
  });
});
