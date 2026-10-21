import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';

export type QrCard = { url: string; title: string; subtitle: string };

const MM = 72 / 25.4;
const CARD_W = 70; // mm
const CARD_H = 90;

/**
 * Draws one card on a canvas so the browser shapes the Arabic text,
 * then the PNG goes into the PDF (pdf-lib cannot shape Arabic).
 */
async function cardPng(card: QrCard, color: string): Promise<Uint8Array> {
  const px = 8; // px per mm
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * px;
  canvas.height = CARD_H * px;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, card.url, { width: 50 * px, margin: 1, errorCorrectionLevel: 'M', color: { dark: color } });
  ctx.drawImage(qr, (canvas.width - qr.width) / 2, 8 * px);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = `700 ${7 * px}px Cairo, sans-serif`;
  ctx.fillText(card.title, canvas.width / 2, 68 * px);
  ctx.font = `400 ${4 * px}px Cairo, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(card.subtitle, canvas.width / 2, 78 * px);

  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** A4 sheets with 6 cards each (70 x 90 mm), ready for print or the acrylic stand supplier. */
export async function buildQrPdf(cards: QrCard[], color = '#111827'): Promise<Uint8Array> {
  await document.fonts.load(`700 20px Cairo`);
  const pdf = await PDFDocument.create();
  const A4 = [210 * MM, 297 * MM] as const;
  const cols = 2;
  const rows = 3;
  const gapX = (210 - cols * CARD_W) / (cols + 1);
  const gapY = (297 - rows * CARD_H) / (rows + 1);

  for (let i = 0; i < cards.length; i++) {
    const slot = i % (cols * rows);
    const page = slot === 0 ? pdf.addPage([A4[0], A4[1]]) : pdf.getPages().at(-1)!;
    const png = await pdf.embedPng(await cardPng(cards[i]!, color));
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    page.drawImage(png, {
      x: (gapX + col * (CARD_W + gapX)) * MM,
      y: A4[1] - (gapY + row * (CARD_H + gapY) + CARD_H) * MM,
      width: CARD_W * MM,
      height: CARD_H * MM,
    });
  }
  return pdf.save();
}

export function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
