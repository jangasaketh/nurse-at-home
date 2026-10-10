// Getting a prescription from the phone camera, the gallery or a PDF.
//
// Photos are shrunk before they are kept (longest side 1600 px, JPEG), so a 5 MB camera photo becomes
// about 200 to 400 KB. That keeps them small enough to save in the browser now, and quick to upload later.
//
// TODO (backend): upload the file to private storage (for example Supabase Storage) and keep only its id
// here. Only the caregiver who takes the booking, and support, should be able to open it.

export type Prescription = {
  kind: "image" | "pdf";
  name: string;
  size: number; // bytes, after shrinking for photos
  dataUrl: string | null; // the shrunk photo; null for a PDF until there is a server to upload it to
  addedAt: number;
};

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const LONG_SIDE = 1600;
const MIN_SIDE = 300; // smaller than this and the handwriting cannot be read

export type PrescriptionError = "type" | "too-big" | "pdf-too-big" | "unreadable" | "small";

export class PrescriptionProblem extends Error {
  constructor(public reason: PrescriptionError) {
    super(reason);
  }
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
const isImage = (file: File) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new PrescriptionProblem("unreadable")); };
    img.src = url;
  });
}

function shrink(img: HTMLImageElement, longSide: number, quality: number) {
  const scale = Math.min(1, longSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrescriptionProblem("unreadable");
  ctx.fillStyle = "#FFFFFF"; // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Bytes taken by a base64 data URL. */
const dataUrlBytes = (dataUrl: string) => Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/** Checks the file and turns it into a Prescription. Throws PrescriptionProblem when it cannot be used. */
export async function preparePrescription(file: File): Promise<Prescription> {
  if (isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) throw new PrescriptionProblem("pdf-too-big");
    return { kind: "pdf", name: file.name, size: file.size, dataUrl: null, addedAt: Date.now() };
  }
  if (!isImage(file)) throw new PrescriptionProblem("type");
  if (file.size > MAX_PHOTO_BYTES) throw new PrescriptionProblem("too-big");

  const img = await loadImage(file);
  if (Math.min(img.naturalWidth, img.naturalHeight) < MIN_SIDE) throw new PrescriptionProblem("small");
  let dataUrl = shrink(img, LONG_SIDE, 0.8);
  if (dataUrlBytes(dataUrl) > 700 * 1024) dataUrl = shrink(img, 1200, 0.65);
  return { kind: "image", name: file.name || "photo.jpg", size: dataUrlBytes(dataUrl), dataUrl, addedAt: Date.now() };
}

export const fileSizeText = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
