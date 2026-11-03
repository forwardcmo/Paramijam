# paramijam.com (GitHub Pages)

Commit this folder's contents to the repo root (keep the existing Paramijam-Justification-Letter.pdf).

- / → Drop 1 page (new home page)
- /drop1 → redirects to /
- /checkout → Stripe checkout (set apiUrl in checkout/index.html once the Worker is live)
- /advisory → CAB + Partners page
- CNAME → www.paramijam.com
- .nojekyll → stops GitHub from ignoring the _ds folder

Before committing, set liveCountUrl (index.html) and apiUrl (checkout/index.html) to the Worker URL: search for "liveCountUrl" / "apiUrl" in the data-props JSON and fill in the "default" value.
