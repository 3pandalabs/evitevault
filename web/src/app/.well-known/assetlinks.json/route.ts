// Digital Asset Links for the Android app (android/, package
// com.threepandalabs.rsvpvault). Chrome checks this file before it will open the
// site as a Trusted Web Activity; without a matching fingerprint the app falls
// back to showing a browser URL bar, and Play reviewers reject it as a
// "webview wrapper".
//
// A route handler rather than a file in public/: the Workers static-asset
// upload and the Next public/ copy both treat dot-directories inconsistently,
// and this guarantees `Content-Type: application/json`, which the Digital
// Asset Links API requires.
//
// At least TWO fingerprints belong here once the app exists on Play:
//   1. The UPLOAD key (below) — signs the AAB we upload, and any APK sideloaded
//      from a local build.
//   2. The Play App Signing key(s) — Google re-signs what users install with its
//      own key. Copy its SHA-256 from Play Console → Test and release → Setup →
//      App signing, add it to the array, and redeploy the web app BEFORE
//      promoting any release. Until then, installs from Play show a URL bar.
// See infra/play-store/README.md.
const SHA256_CERT_FINGERPRINTS = [
  // Upload key: C:\Users\Anil\Documents\keys\rsvpvault-upload.jks, alias "upload".
  "BE:3B:5F:DC:D0:08:6B:29:C9:BE:E7:E0:EA:63:00:83:EF:D5:55:9F:00:DB:21:68:2B:C2:41:39:1B:34:88:8D",
  // Play App Signing (app 4972537245283262876), every SHA-256 Play lists: classical, quantum-ready, extra cert.
  "68:F1:41:61:1B:57:84:9B:88:81:FA:23:48:85:22:46:18:9B:BA:0C:42:B1:57:D1:8C:EA:3D:3C:9E:10:88:1F",
  "A6:72:09:9C:EE:CC:13:DF:66:D6:8F:48:DF:4A:E0:ED:11:23:7F:97:AB:A3:CA:2A:79:EF:3A:CD:82:A3:FE:6C",
  "C4:9F:E5:D0:A0:BE:2A:3C:B9:2F:4F:B7:B2:8F:53:3F:FE:67:8F:95:8A:17:8D:40:C8:38:15:2E:59:5E:90:2B",
  // Play App Signing fingerprints: ADD HERE after the app is created in Play
  // Console. Add EVERY fingerprint Play lists under App signing ("Copy all
  // certificate fingerprints"): the classical app signing key, the
  // "Quantum-ready (beta)" post-quantum key, and any further signing
  // certificate. Newer phones can present any of them, and Chrome falls back
  // to a Custom Tab with an address bar if the one it sees is missing (AdVault
  // showed this on a Galaxy Fold until all were listed, 2026-11-22).
];

const statements = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.threepandalabs.rsvpvault",
      sha256_cert_fingerprints: SHA256_CERT_FINGERPRINTS,
    },
  },
];

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
