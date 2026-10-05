# PDF Night Reader – PWABuilder APK guide

Everything is bundled locally (PDF.js, fonts, CMaps, icons, service worker), so after install the app works fully offline.

## Steps
1. Upload ALL files in this folder to any free HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, Vercel). index.html must be at the site root.
2. Open the site once in Chrome (online) so the service worker caches everything.
3. Go to https://www.pwabuilder.com, paste your site URL, press Start.
4. Manifest + Service Worker should show green. Press Package for stores > Android.
5. Download the package. Install the .apk on your phone. Done.

After install: no internet needed, ever. Open PDFs straight from your device.

## Files
- index.html, style.css, script.js – the app
- manifest.webmanifest – PWA manifest
- sw.js – offline cache (cache-first, precaches all files). Change CACHE name to v2 when you update the app.
- icons/ – 192, 512 and maskable 512
- lib/ – PDF.js engine, worker, cmaps, standard fonts, wasm, icc (offline)
