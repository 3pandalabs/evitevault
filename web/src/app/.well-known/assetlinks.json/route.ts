// Digital Asset Links for the Android app (android/, package
// com.threepanda.rsvpvault). Chrome checks this file before it will open the
// site as a Trusted Web Activity; without a matching fingerprint the app falls
// back to showing a browser URL bar, and Play reviewers reject it as a
// "webview wrapper".
//
// A route handler rather than a file in public/: the Workers static-asset
// upload and the Next public/ copy both treat dot-directories inconsistently,
// and this guarantees `Content-Type: application/json`, which the Digital
// Asset Links API requires.
//
// TWO fingerprints belong here once the app exists on Play:
//   1. The UPLOAD key (below) — signs the AAB we upload, and any APK sideloaded
//      from a local build.
//   2. The Play App Signing key — Google re-signs what users install with its
//      own key. Copy its SHA-256 from Play Console → Test and release → Setup →
//      App signing, add it to the array, and redeploy the web app BEFORE
//      promoting any release. Until then, installs from Play show a URL bar.
// See infra/play-store/README.md.
const SHA256_CERT_FINGERPRINTS = [
  // Upload key: C:\Users\Anil\Documents\keys\rsvpvault-upload.jks, alias "upload".
  "BE:3B:5F:DC:D0:08:6B:29:C9:BE:E7:E0:EA:63:00:83:EF:D5:55:9F:00:DB:21:68:2B:C2:41:39:1B:34:88:8D",
  // Play App Signing key: ADD HERE after the app is created in Play Console.
];

const statements = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.threepanda.rsvpvault",
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
