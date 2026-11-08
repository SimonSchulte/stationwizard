import { VB_GRENZEN } from '../models/vb.model';

/** Kantenlängen und JPEG-Qualitäten, die der Reihe nach versucht werden, bis das Foto passt. */
const STUFEN: readonly { kante: number; qualitaet: number }[] = [
  { kante: 1200, qualitaet: 0.75 },
  { kante: 1000, qualitaet: 0.7 },
  { kante: 800, qualitaet: 0.65 },
  { kante: 640, qualitaet: 0.6 },
  { kante: 480, qualitaet: 0.55 },
];

/**
 * Verkleinert ein Foto im Browser zu einer JPEG-Data-URL, die in `VB_GRENZEN.foto` passt
 * (das Foto wird im Abschnitt der VB gespeichert und gedruckt). Wirft einen Fehler mit
 * verständlichem Text, wenn die Datei kein lesbares Bild ist oder nicht klein genug wird.
 */
export async function fotoVerkleinern(datei: Blob): Promise<string> {
  if (!datei.type.startsWith('image/')) throw new Error('Das ist keine Bilddatei.');
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(datei);
  } catch {
    throw new Error('Das Bild konnte nicht gelesen werden.');
  }
  try {
    for (const { kante, qualitaet } of STUFEN) {
      const massstab = Math.min(1, kante / Math.max(bild.width, bild.height));
      const leinwand = document.createElement('canvas');
      leinwand.width = Math.max(1, Math.round(bild.width * massstab));
      leinwand.height = Math.max(1, Math.round(bild.height * massstab));
      const kontext = leinwand.getContext('2d');
      if (!kontext) throw new Error('Das Bild konnte nicht verarbeitet werden.');
      // JPEG kennt keine Transparenz: weißer Grund statt Schwarz.
      kontext.fillStyle = '#fff';
      kontext.fillRect(0, 0, leinwand.width, leinwand.height);
      kontext.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
      const url = leinwand.toDataURL('image/jpeg', qualitaet);
      if (url.startsWith('data:image/jpeg;base64,') && url.length <= VB_GRENZEN.foto) return url;
    }
  } finally {
    bild.close();
  }
  throw new Error('Das Foto lässt sich nicht klein genug speichern.');
}
