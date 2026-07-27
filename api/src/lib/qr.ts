import QRCode from "qrcode";

// Server-side QR generation, for embedding in emails. The dashboard draws its
// own in the browser (a QR is a pure function of the URL, so there's no reason
// to round-trip) — but an email has to carry the image with it, so this one is
// rendered here and attached.
//
// Error correction M (~15% damage tolerance): these get photographed off a
// screen at an angle, or printed. The URL is short enough that the redundancy
// costs no meaningful density.
export function qrPngBase64(url: string, width = 480): Promise<string> {
  return QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width, type: "png" }).then(
    (buf) => buf.toString("base64"),
  );
}
