// Confere um AAB antes do upload no Play Console:
//   node scripts/check-android-release.mjs <arquivo.aab> <versionCode mínimo>
// Sai com código 0 só se todas as verificações passarem.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const PACKAGE = 'br.com.unumpeople.crm';
const MIN_TARGET_SDK = 36; // exigência do Google Play desde 31/08/2026
// Chave de upload registrada no Play Console (android/unum-key.keystore). Não é a
// chave de assinatura do app (75:E8:…, em twa-manifest.json e assetlinks.json):
// essa fica com o Google, que re-assina o app depois do upload.
const UPLOAD_KEY_SHA256 =
  '04:03:F2:B1:22:A6:BE:B6:6F:19:1F:D0:DB:89:B7:A6:FE:2F:58:E2:A0:E7:CF:17:98:5A:4F:97:26:30:58:B7';

const [aab, minVersionCodeArg] = process.argv.slice(2);
if (!aab || !minVersionCodeArg) {
  console.error('Uso: node scripts/check-android-release.mjs <arquivo.aab> <versionCode mínimo>');
  process.exit(2);
}
const minVersionCode = Number(minVersionCodeArg);

// O JDK do Bubblewrap não fica no PATH: usa JAVA_HOME ou o jdkPath de ~/.bubblewrap/config.json.
function jdkBin(tool) {
  let home = process.env.JAVA_HOME;
  const bubblewrapConfig = path.join(homedir(), '.bubblewrap', 'config.json');
  if (!home && existsSync(bubblewrapConfig)) home = JSON.parse(readFileSync(bubblewrapConfig, 'utf8')).jdkPath;
  return home ? path.join(home, 'bin', tool) : tool;
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    console.error(`Falha ao executar ${cmd}: ${err.stderr || err.message}`);
    process.exit(2);
  }
}

if (!existsSync(aab)) {
  console.error(`AAB não encontrado: ${aab}`);
  process.exit(2);
}
const bundletool = process.env.BUNDLETOOL_JAR || path.join(homedir(), '.bubblewrap', 'bundletool.jar');
if (!existsSync(bundletool)) {
  console.error(`bundletool não encontrado em ${bundletool} (defina BUNDLETOOL_JAR)`);
  process.exit(2);
}

const manifest = (xpath) =>
  run(jdkBin('java'), ['-jar', bundletool, 'dump', 'manifest', '--bundle', aab, '--xpath', xpath]);

const pkg = manifest('/manifest/@package');
const versionCode = Number(manifest('/manifest/@android:versionCode'));
const targetSdk = Number(manifest('/manifest/uses-sdk/@android:targetSdkVersion'));

const certSha256 = run(jdkBin('keytool'), ['-printcert', '-jarfile', aab]).match(/SHA256:\s*([0-9A-F:]+)/)?.[1];

const checks = [
  [`package = ${PACKAGE}`, pkg === PACKAGE, pkg],
  [`targetSdkVersion >= ${MIN_TARGET_SDK}`, targetSdk >= MIN_TARGET_SDK, targetSdk],
  [`versionCode >= ${minVersionCode}`, versionCode >= minVersionCode, versionCode],
  ['assinado com a chave de upload', certSha256 === UPLOAD_KEY_SHA256, certSha256 ?? 'sem assinatura'],
];

for (const [label, ok, actual] of checks) console.log(`${ok ? 'OK  ' : 'FALHA'} ${label} (encontrado: ${actual})`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
