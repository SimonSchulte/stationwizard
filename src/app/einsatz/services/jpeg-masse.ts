/**
 * Liest Breite und Höhe eines JPEG aus der Data-URL (Start-of-Frame-Marker), ohne es zu
 * dekodieren. Dient dem Schild, den Rahmen eng ums Foto zu legen. Liefert `null`, wenn das
 * Muster nicht lesbar ist; der Aufrufer nimmt dann das ganze Feld.
 */
export function jpegMasse(dataUrl: string): { breite: number; hoehe: number } | null {
  const komma = dataUrl.indexOf(',');
  if (komma < 0) return null;
  let bytes: string;
  try {
    bytes = atob(dataUrl.slice(komma + 1));
  } catch {
    return null;
  }
  if (bytes.charCodeAt(0) !== 0xff || bytes.charCodeAt(1) !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes.charCodeAt(i) !== 0xff) return null;
    const marker = bytes.charCodeAt(i + 1);
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const laenge = (bytes.charCodeAt(i + 2) << 8) | bytes.charCodeAt(i + 3);
    // SOF0–SOF15 ohne DHT (C4), JPG (C8) und DAC (CC) tragen die Bildmaße.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const hoehe = (bytes.charCodeAt(i + 5) << 8) | bytes.charCodeAt(i + 6);
      const breite = (bytes.charCodeAt(i + 7) << 8) | bytes.charCodeAt(i + 8);
      return breite > 0 && hoehe > 0 ? { breite, hoehe } : null;
    }
    i += 2 + laenge;
  }
  return null;
}
