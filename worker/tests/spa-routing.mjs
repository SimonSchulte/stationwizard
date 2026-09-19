/**
 * Lokaler Nachweis mit dem tatsächlich gebündelten Produktionsworker und workerd.
 * Die Testumgebung beantwortet ausschließlich die JWKS-Anfrage mit einem frisch
 * erzeugten öffentlichen Testschlüssel.
 *
 * Es gibt genau einen eng begrenzten, dokumentierten Bypass: die öffentliche
 * Kilometermeldung unter `/e/<token>`, `/oeffentlich/<datei>` und
 * `/api/oeffentlich/meldung/<token>` (siehe docs/einrichtung.md für die
 * zugehörige Access-Regel). Alles andere, einschließlich sämtlicher Assets und
 * aller übrigen `/api/*`-Pfade, verlangt ein verifiziertes Access-JWT. Beides
 * wird hier am echten Bundle nachgewiesen – die Beinahetreffer ebenso wie der
 * erlaubte Pfad.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { unstable_readConfig } from 'wrangler';

process.env['WRANGLER_SEND_METRICS'] = 'false';
process.env['CLOUDFLARE_CF_FETCH_ENABLED'] = 'false';

const projekt = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const konfigPfad = join(projekt, 'worker/wrangler.toml');
const konfiguration = unstable_readConfig({ config: konfigPfad }, { hideWarnings: true });
assert.equal(konfiguration.assets?.run_worker_first, true);
assert.equal(konfiguration.assets?.not_found_handling, 'single-page-application');
assert.equal(konfiguration.assets?.binding, 'ASSETS');

const assetsVerzeichnis = resolve(dirname(konfigPfad), konfiguration.assets.directory);
const index = await readFile(join(assetsVerzeichnis, 'index.html'), 'utf8');
const javascript = (await readdir(assetsVerzeichnis)).find((name) => /^main.*\.js$/.test(name));
assert.ok(javascript, 'Bitte zuerst npm run build ausführen: Angular-JavaScript fehlt.');

// Die Erlaubnisliste des Workers gegen das tatsächliche Build-Ergebnis des
// zweiten Ziels: der Worker liefert unter /oeffentlich/ ausschließlich diese
// Dateien aus. Weicht der Build ab, fiele die fehlende Datei sonst in die
// SPA-Rückfallebene und damit auf die geschützte App-Hülle.
const OEFFENTLICHE_DATEIEN = ['index.html', 'main.js', 'styles.css'];
const oeffentlichVerzeichnis = join(assetsVerzeichnis, 'oeffentlich');
const gebaut = await readdir(oeffentlichVerzeichnis);
for (const datei of OEFFENTLICHE_DATEIEN) {
  assert.ok(
    gebaut.includes(datei),
    `Das öffentliche Build-Ziel liefert ${datei} nicht mehr; Erlaubnisliste in worker/src/oeffentliche-erfassung.ts anpassen.`,
  );
}
for (const datei of gebaut.filter((name) => /\.(js|css|html)$/.test(name))) {
  assert.ok(
    OEFFENTLICHE_DATEIEN.includes(datei),
    `Das öffentliche Build-Ziel liefert zusätzlich ${datei}; es wäre über /oeffentlich/ nicht erreichbar.`,
  );
}

// Bewusst innerhalb des Projekts statt im Systemtempverzeichnis: workerd löst
// die Module relativ zur Projektwurzel auf und lehnt einen Pfad ab, der über
// sie hinausführt ("can't use '..' to break out of starting directory").
const ausgabe = await mkdtemp(join(projekt, 'dist/spa-routing-'));
let laufzeit;
try {
  execFileSync(
    process.execPath,
    [
      join(projekt, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy',
      '--dry-run',
      '--config',
      konfigPfad,
      '--outdir',
      ausgabe,
    ],
    {
      cwd: projekt,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' },
    },
  );

  const teamDomain = 'https://stationwizard-test.cloudflareaccess.com';
  const audience = 'stationwizard-lokaler-test';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const oeffentlicherSchluessel = await exportJWK(publicKey);
  const jwks = {
    keys: [{ ...oeffentlicherSchluessel, kid: 'nur-lokaler-test', alg: 'RS256', use: 'sig' }],
  };
  const token = await new SignJWT({ email: 'erfunden@example.invalid', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'nur-lokaler-test' })
    .setIssuer(teamDomain)
    .setAudience(audience)
    .setSubject('erfundener-testbenutzer')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  let schluesselAbrufe = 0;
  // Die installierte Miniflare-Fassung verlangt im Konstruktor die
  // Mehr-Worker-Form (`workers: [...]`). `convertV4MiniflareOptions` ist der
  // dafür ausgelieferte, öffentlich exportierte Übersetzer – damit bleibt
  // diese Datei bei der lesbaren Ein-Worker-Schreibweise, statt die interne
  // Struktur der neuen Fassung nachzubauen.
  laufzeit = new Miniflare(
    convertV4MiniflareOptions({
      // Keine externe Standortabfrage gegen workers.cloudflare.com/cf.json.
      cf: false,
      // Benannt, weil die Static-Assets-Weiterleitung den Nutzerworker sonst nicht
      // findet ("Fetch for user worker without having a user worker binding").
      name: konfiguration.name,
      modules: true,
      scriptPath: join(ausgabe, 'index.js'),
      compatibilityDate: konfiguration.compatibility_date,
      bindings: { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience },
      assets: {
        directory: assetsVerzeichnis,
        binding: konfiguration.assets.binding,
        run_worker_first: konfiguration.assets.run_worker_first,
        assetConfig: { not_found_handling: konfiguration.assets.not_found_handling },
        // Ohne dieses Kennzeichen weigert sich die Static-Assets-Weiterleitung,
        // überhaupt einen Worker aufzurufen – der eigentliche Prüfgegenstand.
        routerConfig: { has_user_worker: true },
      },
      outboundService: async (anfrage) => {
        assert.equal(anfrage.url, `${teamDomain}/cdn-cgi/access/certs`);
        schluesselAbrufe += 1;
        return new Response(JSON.stringify(jwks), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
  );

  const basisUrl = 'https://stationwizard.example';
  const anmeldung = { 'Cf-Access-Jwt-Assertion': token };
  const navigation = { ...anmeldung, 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' };
  for (const pfad of ['/', '/ausbildung', '/einsatz', '/einsatz/planung/erfundene-id']) {
    const antwort = await laufzeit.dispatchFetch(`${basisUrl}${pfad}`, { headers: navigation });
    assert.equal(antwort.status, 200, `SPA-Direkteinstieg ${pfad}`);
    assert.equal(await antwort.text(), index, `index.html-Rückfallebene ${pfad}`);
  }

  const skript = await laufzeit.dispatchFetch(`${basisUrl}/${javascript}`, { headers: anmeldung });
  assert.equal(skript.status, 200);
  assert.match(skript.headers.get('Content-Type') ?? '', /javascript/);

  const oeffentlichesToken = 'a'.repeat(32);
  for (const pfad of [
    '/',
    '/ausbildung',
    '/einsatz/planung/erfunden',
    `/${javascript}`,
    '/api/status',
    // Beinahetreffer der öffentlichen Muster: sie bleiben gesperrt.
    '/e',
    '/e/',
    '/e/zu-kurz',
    `/e/${oeffentlichesToken}/extra`,
    `/ef/${oeffentlichesToken}`,
    '/oeffentlich/',
    '/oeffentlich/unter/main.js',
    '/api/oeffentlich/meldung',
    '/api/oeffentlich/anderes',
  ]) {
    const antwort = await laufzeit.dispatchFetch(`${basisUrl}${pfad}`, {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    });
    assert.equal(antwort.status, 401, `Access-Pflicht ${pfad}`);
    assert.equal((await antwort.json()).code, 'ACCESS_TOKEN_FEHLT');
  }

  // Der erlaubte Pfad, ohne jede Anmeldung. In dieser Umgebung ist keine
  // D1-Datenbank gebunden, deshalb 503 statt 200 – und genau das ist der
  // Nachweis: der Zweig greift vor der Anmeldeprüfung, liefert aber nichts aus.
  const oeffentlicheApi = await laufzeit.dispatchFetch(
    `${basisUrl}/api/oeffentlich/meldung/${oeffentlichesToken}`,
  );
  assert.equal(oeffentlicheApi.status, 503, 'öffentliche Meldung ohne Anmeldung erreichbar');
  assert.equal((await oeffentlicheApi.json()).code, 'MELDUNG_KONFIGURATION_FEHLT');

  // Die Meldeseite und ihre beiden Dateien kommen ohne Anmeldung aus den Assets.
  for (const [pfad, typ] of [
    [`/e/${oeffentlichesToken}`, /html/],
    ['/oeffentlich/main.js', /javascript/],
    ['/oeffentlich/styles.css', /css/],
  ]) {
    const antwort = await laufzeit.dispatchFetch(`${basisUrl}${pfad}`);
    assert.equal(antwort.status, 200, `öffentliche Datei ${pfad}`);
    assert.match(antwort.headers.get('Content-Type') ?? '', typ, pfad);
    assert.equal(antwort.headers.get('Cache-Control'), 'no-store', pfad);
    assert.equal(antwort.headers.get('X-Robots-Tag'), 'noindex, nofollow', pfad);
  }

  // Und sie liefert unter keinen Umständen die geschützte App-Hülle.
  const meldeseite = await laufzeit.dispatchFetch(`${basisUrl}/e/${oeffentlichesToken}`);
  const meldeseiteInhalt = await meldeseite.text();
  assert.notEqual(meldeseiteInhalt, index, 'öffentliche Seite liefert die geschützte App-Hülle');
  assert.match(meldeseiteInhalt, /oeff-meldung/, 'öffentliche Seite ist nicht die Meldeseite');

  // Die Richtlinie muss zum ausgelieferten HTML passen. Beides wird an
  // verschiedenen Stellen gepflegt (Worker und Angular-Build); passt es nicht
  // zusammen, lädt die Seite im Browser nichts und bleibt leer – ein Fehler,
  // den kein Einzeltest der beiden Seiten bemerkt.
  const richtlinie = meldeseite.headers.get('Content-Security-Policy') ?? '';
  if (/<base\s/i.test(meldeseiteInhalt)) {
    assert.doesNotMatch(
      richtlinie,
      /base-uri 'none'/,
      "Die Seite trägt ein <base>-Tag, die Richtlinie verbietet es mit base-uri 'none': " +
        'Stil und Skript würden gegen /e/ aufgelöst und die Seite bliebe leer.',
    );
  }
  if (/style-src 'self'(?!.*unsafe-inline)/.test(richtlinie)) {
    assert.doesNotMatch(
      meldeseiteInhalt,
      /<style[\s>]/i,
      "Die Seite enthält ein inline <style>, die Richtlinie erlaubt aber nur style-src 'self'.",
    );
  }
  if (/script-src 'self'(?!.*unsafe-inline)/.test(richtlinie)) {
    assert.doesNotMatch(
      meldeseiteInhalt,
      /<script(?![^>]*\ssrc=)/i,
      "Die Seite enthält ein inline <script>, die Richtlinie erlaubt aber nur script-src 'self'.",
    );
    assert.doesNotMatch(
      meldeseiteInhalt,
      /\son[a-z]+=/i,
      'Die Seite enthält ein Ereignisattribut; das verlangt unsafe-inline für Skripte.',
    );
  }

  // Eine nicht gelistete Datei fällt nicht in die SPA-Rückfallebene.
  for (const pfad of ['/oeffentlich/3rdpartylicenses.txt', '/oeffentlich/index2.html']) {
    const antwort = await laufzeit.dispatchFetch(`${basisUrl}${pfad}`);
    assert.equal(antwort.status, 404, `nicht gelistete Datei ${pfad}`);
    assert.notEqual(await antwort.text(), index, `App-Hülle über ${pfad} ausgeliefert`);
  }

  const gefaelscht = await laufzeit.dispatchFetch(`${basisUrl}/ausbildung`, {
    headers: { 'Cf-Access-Jwt-Assertion': 'gefaelscht' },
  });
  assert.equal(gefaelscht.status, 401);

  const status = await laufzeit.dispatchFetch(`${basisUrl}/api/status`, { headers: anmeldung });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { status: 'erreichbar' });

  const benutzer = await laufzeit.dispatchFetch(`${basisUrl}/api/benutzer`, { headers: anmeldung });
  assert.equal(benutzer.status, 200);
  assert.deepEqual(await benutzer.json(), { email: 'erfunden@example.invalid' });

  const unbekannt = await laufzeit.dispatchFetch(`${basisUrl}/api/unbekannt`, {
    headers: navigation,
  });
  assert.equal(unbekannt.status, 404);
  assert.equal(unbekannt.headers.get('Cache-Control'), 'no-store');
  assert.equal((await unbekannt.json()).code, 'API_NICHT_GEFUNDEN');
  assert.equal(schluesselAbrufe, 1, 'Öffentliche JWKS werden pro Worker zwischengespeichert.');
  console.log(
    'workerd: SPA-Direkteinstiege, JavaScript, Access-Pflicht, der eng begrenzte ' +
      'Bypass der öffentlichen Kilometermeldung und API-404 erfolgreich geprüft.',
  );
} finally {
  await laufzeit?.dispose();
  await rm(ausgabe, { recursive: true, force: true });
}
