"use client";

/**
 * The site root.
 *
 * Without this the static export contains no `index.html` at all, so a web
 * deployment 404s on its own home page. That never showed up on the desktop,
 * where Tauri opens `/home-page` directly and nothing ever asks for `/`.
 *
 * A client-side replace rather than a server redirect, because `output:
 * "export"` produces static files with no server to redirect from. `replace`
 * rather than `push` so the root does not become a history entry the back
 * button bounces off.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home-page");
  }, [router]);

  return (
    <div className="grid min-h-0 flex-1 place-items-center text-muted-foreground">
      Loading…
    </div>
  );
}
