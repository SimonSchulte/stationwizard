/** Secrets Store liefert ein Objekt mit get(), klassische Worker-Secrets einen String. */
export type Zugangsdatum = string | SecretsStoreSecret | undefined;

/** Nicht auflösbare Bindings bleiben fehlend; Geheimnisse erscheinen nie in Fehlermeldungen. */
export async function leseZugangsdatum(quelle: Zugangsdatum): Promise<string | undefined> {
  if (typeof quelle === 'string') {
    return quelle;
  }
  try {
    return await quelle?.get();
  } catch {
    return undefined;
  }
}
