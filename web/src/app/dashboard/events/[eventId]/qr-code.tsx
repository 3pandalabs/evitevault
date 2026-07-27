"use client";

import { Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Generated in the browser rather than by the API. A QR code is a pure function
// of the URL — round-tripping to the server to draw one would add a request, a
// route and an R2 object for something the client can produce instantly and
// re-render at any size for download.
export function EventQrCode({ url, slug }: { url: string; slug: string }) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Error correction level M tolerates ~15% damage. Worth it here because
    // these get printed on cards, stuck to walls, and photographed at angles —
    // the URL is short enough that the extra redundancy costs no meaningful
    // density.
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 })
      .then((dataUrl) => {
        if (!cancelled) setPngUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  async function download(format: "png" | "svg") {
    const a = document.createElement("a");
    a.download = `evitevault-${slug.slice(0, 8)}.${format}`;

    if (format === "png") {
      // 1024px so it stays crisp when scaled up for print. A QR scanned from a
      // card at arm's length needs the modules to survive the printer.
      a.href = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 1024 });
    } else {
      // SVG for anything going to a real printer — vector means the code stays
      // sharp at poster size, where an upscaled PNG would soften the module
      // edges and cost scan reliability.
      const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
      a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    }

    a.click();
    if (format === "svg") URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="size-4 text-slate-400" />
          QR code
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">Couldn&apos;t generate a QR code.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              {pngUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pngUrl} alt={`QR code linking to ${url}`} className="size-40" />
              ) : (
                <div className="size-40 animate-pulse rounded bg-slate-100" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-600">
                Scanning this opens the invitation and the RSVP form. Put it on a printed card,
                a poster, or a message — anyone who scans it can reply.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => download("png")} disabled={!pngUrl}>
                  <Download className="size-4" />
                  PNG
                </Button>
                <Button variant="outline" size="sm" onClick={() => download("svg")} disabled={!pngUrl}>
                  <Download className="size-4" />
                  SVG for print
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
