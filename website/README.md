# Nokia Retro Phone website

Static landing page with a Vercel Function at `api/subscribe.js`.

## Local checks

```powershell
npm test
python -m http.server 4173
```

UI regression checks use the Playwright runtime bundled with Codex:

```powershell
node tests/ui_test.cjs
```

The deployed function forwards validated early-access submissions to FormSubmit,
which delivers them to `mr.ahhk142857@gmail.com`. FormSubmit requires a one-time
confirmation from that inbox after the first live submission.
