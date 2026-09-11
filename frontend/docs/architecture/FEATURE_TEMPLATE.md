# Feature/change contract

Copy into a real feature's documentation only when needed; fill it before implementation.

## Purpose and behavior

- User task and finite exit:
- Expected behavior and observable acceptance:
- Existing owner to extend (run `npm run trace -- <topic>`):
- Consumers that must remain compatible:

## Interface

- Inputs, outputs and event ordering:
- Pure rules and error states:
- Native facade methods and permissions, if any:
- State lifetime: render / feature session / process / durable storage:
- Data validation, size limits and storage version:
- Side effects and whether retry is safe (sending is not automatically retryable):

## Resource lifecycle, if applicable

| Event | Resource action | Pending work/result policy |
| --- | --- | --- |
| Create/start | | |
| Switch/replace | | |
| Background | | |
| Resume | | |
| Stop/destroy | | |
| Late callback / permission denial / renderer loss | | |

## Trace and verification

- Reproduction and first broken invariant:
- Entry -> semantic intent -> state owner -> adapter -> native effect -> result:
- Failure test, normal test and affected consumer tests:
- Device scenario, sample count, p50/p90 thresholds, readiness and stopping rule:
- Build/version/hash and device identifier used:
- Evidence artifacts, observed result, remaining unknowns:
- Module-map update and isolated rollback commit/patch:
