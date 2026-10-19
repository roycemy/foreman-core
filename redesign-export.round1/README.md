# Redesign export: how to drop it in

```
public/index.html        app shell (generated from live index.html by tools/build_index.py)
public/oauth.html        /oauth/authorize page (copy verbatim; restyled)
public/brand.js          BRAND token: the ONE line to rebrand (name: 'Black Box')
public/styles/tokens.css design tokens + presence chips
public/styles/app.css    app styles (replaces the 12 legacy <style> layers)
public/hq/floor.svg      HQ floor environment art
marketing/index.html     public marketing page (uses /styles/tokens.css + /brand.js)
shots/                   verification screenshots (desktop 1440, mobile 390)
tools/                   build script, mock API, verify harness, floor generator
```

**Serving (owner decides).** Recommended: serve `marketing/index.html` at `/` for signed-out visitors and the app at `/hq`. Then set `appUrl:'/hq'` in `brand.js` and route `/hq` to `public/index.html`.
Today's routing (app at `/`) works unchanged; the marketing CTAs default to `/`.

**Rebuild after upstream changes:** `cd tools && python3 build_index.py <live index.html> ../public/index.html`. It fails loudly if an expected snippet moved.

**Verify:** `python3 -m http.server 8771 --bind 127.0.0.1 --directory public &` then `node tools/verify.js`. This needs playwright-core plus Chrome; adjust the paths at the top of the file.
