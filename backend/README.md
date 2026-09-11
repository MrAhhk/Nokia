# Nokia Launcher optional backend

This FastAPI service is an optional sibling of the installed launcher. The
launcher does not currently use the preference endpoints.

## Administrative preferences

`GET /api/apps/preferences` and `POST /api/apps/preferences` operate on one
shared configuration collection. They are server-administration endpoints,
not per-user storage. Set `PREFERENCES_ADMIN_TOKEN` to a long random secret and
send it as `Authorization: Bearer <token>`. If the variable is absent or empty,
both endpoints are disabled and return HTTP 503. Invalid or missing credentials
return HTTP 401. Do not expose this token to the Android app or browser bundle.

Preference writes accept 1 to 100 entries. Each app ID is restricted to 128
safe identifier characters and order values are limited to 0 through 9999.
All preference reads return at most 100 entries.

## Resource and browser boundaries

Request bodies are capped at 32 KiB. Integrity verification accepts bounded
token, challenge, and action fields and permits four simultaneous Google decode
workers; excess requests return HTTP 503 with `Retry-After: 1`. Worker slots
remain occupied until their thread exits, including when the client disconnects.

Browser origins default to none. Set `CORS_ORIGINS` to a comma-separated exact
allowlist. Credentials default off; if enabled with `CORS_ALLOW_CREDENTIALS=true`,
a wildcard origin is rejected at startup.

## Local verification

Create an isolated environment, install `requirements.txt`, and run:

```powershell
python -m pytest -q
```

The suite is in-process and mocks MongoDB and Google decoding. Never run
`tests/test_nokia_api.py` against a remote host.
