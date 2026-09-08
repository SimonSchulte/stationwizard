/**
 * Lokaler Nachweis mit dem tatsächlich gebündelten Produktionsworker und workerd.
 * Die Testumgebung beantwortet ausschließlich die JWKS-Anfrage mit einem frisch
 * erzeugten öffentlichen Testschlüssel. Es gibt keinen Auth-Bypass im Worker.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Miniflare } from 'miniflare';
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

const ausgabe = await mkdtemp(join(tmpdir(), 'stationwizard-spa-'));
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
  laufzeit = new Miniflare({
    // Keine externe Standortabfrage gegen workers.cloudflare.com/cf.json.
    cf: false,
    modules: true,
    scriptPath: join(ausgabe, 'index.js'),
    compatibilityDate: konfiguration.compatibility_date,
    bindings: { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience },
    assets: {
      directory: assetsVerzeichnis,
      binding: konfiguration.assets.binding,
      run_worker_first: konfiguration.assets.run_worker_first,
      assetConfig: { not_found_handling: konfiguration.assets.not_found_handling },
    },
    outboundService: async (anfrage) => {
      assert.equal(anfrage.url, `${teamDomain}/cdn-cgi/access/certs`);
      schluesselAbrufe += 1;
      return new Response(JSON.stringify(jwks), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

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

  for (const pfad of [
    '/',
    '/ausbildung',
    '/einsatz/planung/erfunden',
    `/${javascript}`,
    '/api/status',
  ]) {
    const antwort = await laufzeit.dispatchFetch(`${basisUrl}${pfad}`, {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    });
    assert.equal(antwort.status, 401, `Access-Pflicht ${pfad}`);
    assert.equal((await antwort.json()).code, 'ACCESS_TOKEN_FEHLT');
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
    'workerd: SPA-Direkteinstiege, JavaScript, Access-Pflicht und API-404 erfolgreich geprüft.',
  );
} finally {
  await laufzeit?.dispose();
  await rm(ausgabe, { recursive: true, force: true });
}
