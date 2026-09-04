# Nokia Retro Phone website

Static landing page with a Vercel Function at `api/subscribe.js`.

## Local checks

```powershell
npm test
npm run build
python -m http.server 4173
```

UI regression checks use the Playwright runtime bundled with Codex:

```powershell
node tests/ui_test.cjs
```

The Vercel function forwards validated early-access submissions to FormSubmit.
On a static host, the browser falls back to the same service directly. FormSubmit
delivers to `mr.ahhk142857@gmail.com` and requires a one-time confirmation from
that inbox after the first live submission.
