export function jsonAntwort(
  inhalt: unknown,
  status = 200,
  zusaetzlicheHeader: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...zusaetzlicheHeader,
    },
  });
}

/** Nur feste Diagnosecodes ausgeben, keine Token, Bindinglisten oder Upstream-Fehler. */
export function fehlerAntwort(
  code: string,
  nachricht: string,
  status: number,
  zusaetzlicheHeader: Record<string, string> = {},
): Response {
  return jsonAntwort({ code, nachricht }, status, {
    'X-Stationwizard-Diagnose': code,
    ...zusaetzlicheHeader,
  });
}
