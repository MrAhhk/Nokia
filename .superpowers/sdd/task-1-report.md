# Task 1 report: optional backend security repair

## Status

Completed. The optional FastAPI backend now fails closed for shared preference
administration, bounds request work, and uses explicit browser-origin defaults.
The Play Integrity capability remains available and its Google decode path is
covered with local mocked behavior.

## Changes

- Protected both shared preference endpoints with a server-configured
  PREFERENCES_ADMIN_TOKEN bearer token. Verification hashes both values and
  uses hmac.compare_digest; a missing/empty server token disables the endpoints
  with HTTP 503, while missing or invalid credentials return HTTP 401.
- Documented that preferences are one shared administrative configuration, not
  per-user storage, and that the token must never ship in a client.
- Limited preference writes to 1-100 entries, IDs to 1-128 safe identifier
  characters, and order values to 0-9999. Extra fields are rejected and reads
  return at most 100 records.
- Added a 32 KiB body ceiling for declared-length and chunked requests. Bounded
  integrity action, token, and challenge fields.
- Added a four-slot nonblocking integrity worker limit. The worker thread owns
  and releases its slot in finally, so cancellation cannot free capacity while
  Google work continues. Saturation returns HTTP 503 and Retry-After: 1.
- Changed CORS defaults to no allowed browser origins, credentials off, and
  explicit methods and headers. Wildcard origins with credentials fail startup.
- Replaced the legacy remote-host API test with in-process HTTP tests using
  mocked MongoDB and Google verification. No test contacted the legacy preview
  host or transmitted user data.
- Reduced requirements.txt to imports actually used by the backend and tests.
  Updated FastAPI to 0.141.1, Requests to 2.34.2, and Motor to 3.7.1. Motor's
  declared PyMongo range resolved successfully to PyMongo 4.18.1.

Primary package metadata checked:

- https://pypi.org/project/fastapi/
- https://pypi.org/project/requests/
- https://pypi.org/project/motor/

## Verification

Environment: isolated app/backend/.venv-task1, Python 3.11. It was removed
after verification and was never staged.

1. Dependency install passed:

       .\.venv-task1\Scripts\python.exe -m pip install --disable-pip-version-check --timeout 30 -r requirements.txt

2. Initial suite command:

       .\.venv-task1\Scripts\python.exe -m pytest -q

   Result: 8 existing integrity tests passed and 17 API tests
   errored because current pytest-asyncio requires an explicit async-fixture
   decorator. No product assertion failed.
3. After correcting the fixture and replacing deprecated FastAPI shutdown
   registration with an application lifespan, the same full-suite command
   passed: 26 passed in 0.68s.
4. Dependency consistency command:

       .\.venv-task1\Scripts\python.exe -m pip check

   Result: No broken requirements found.
5. Static diff command:

       git -C app diff --check -- backend .superpowers/sdd/task-1-pre-edit.md

   Result: passed; Git reported
   only the repository's CRLF conversion warnings.

Regressions cover the public catalog, disabled preferences, missing and wrong
credentials, authorized mocked persistence, all preference bounds, declared
and chunked body ceilings, integrity field bounds, and saturated workers.

## Files

- app/backend/server.py
- app/backend/.env.example
- app/backend/README.md
- app/backend/requirements.txt
- app/backend/tests/test_nokia_api.py
- app/.superpowers/sdd/task-1-pre-edit.md
- app/.superpowers/sdd/task-1-report.md

app/backend/play_integrity.py and its eight focused unit tests required no
change; endpoint validation and scheduling now bound their external use.

## Remaining concerns

- MongoDB and Google Play were deliberately mocked. Deployment credentials,
  production CORS origins, live Mongo behavior, Play Console configuration, and
  a Play-distributed verdict remain external verification work.
- Motor 3.7.1 is compatible with the resolved set but its maintainers announced
  deprecation in favor of PyMongo's async API. Migration is a separate change.
- Deployments that relied on anonymous preferences must configure the
  server-only token and update their administrative caller. The installed
  launcher does not currently use these endpoints.

## Commit

Implementation and pre-edit snapshot:
7f2ac8b95d08b5f6201d924bd8c67ece62df4fdf (Secure optional backend API).

This report is committed separately so it can cite the immutable implementation
commit.
