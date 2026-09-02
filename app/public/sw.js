/*
 * Servicewerker voor de werkplaats (sectie 8.8). De wifi achterin is slecht;
 * de app moet ook openen als het net wegvalt. Alles wat de app nodig heeft
 * staat na het eerste bezoek in de cache, en de gegevens staan toch al lokaal.
 *
 * Strategie: eerst het netwerk (dan is een nieuwe versie meteen zichtbaar),
 * bij een storing de cache. Voor navigaties valt hij terug op de startpagina,
 * zodat een gescand label ook offline opent.
 */
const CACHE = 'fietswerk-v1'
// De app kan in een submap staan (demo op GitHub Pages), dus alles wordt
// berekend vanaf de plek van deze servicewerker.
const ROOT = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([ROOT, `${ROOT}manifest.webmanifest`])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = await caches.match(ROOT)
          if (shell) return shell
        }
        return new Response('', { status: 504, statusText: 'offline' })
      }),
  )
})
