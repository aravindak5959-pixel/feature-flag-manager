# Feature Flag Manager

A small TypeScript backend for creating feature flags and evaluating whether a user should see a feature. It uses only Node's built-in HTTP and crypto modules at runtime. Flags are held in memory, so they reset when the server restarts.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```sh
npm install
npm run dev
```

The API listens on `http://localhost:3000`. Set `PORT` to use another port. To create a production build and run it:

```sh
npm run build
npm start
```

## API

All request and response bodies use JSON.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check that the service is running |
| `GET` | `/flags` | List flags |
| `POST` | `/flags` | Create a flag |
| `GET` | `/flags/:key` | Read one flag |
| `PATCH` | `/flags/:key` | Update selected fields |
| `DELETE` | `/flags/:key` | Delete a flag |
| `POST` | `/flags/:key/evaluate` | Evaluate a flag for a user |

Create a flag with `key` (letters, numbers, `_`, and `-`, up to 64 characters). Optional fields are `description`, `enabled` (defaults to `false`), `rolloutPercentage` (integer 0–100, defaults to `0`), and `userIds` (defaults to an empty array).

```sh
curl -X POST http://localhost:3000/flags \
  -H 'content-type: application/json' \
  -d '{"key":"new-checkout","description":"Try the new checkout","enabled":true,"rolloutPercentage":25,"userIds":["user-42"]}'
```

Evaluate for a user:

```sh
curl -X POST http://localhost:3000/flags/new-checkout/evaluate \
  -H 'content-type: application/json' \
  -d '{"userId":"user-42"}'
```

The response includes `enabled` and a `reason` (`flag_disabled`, `targeted_user`, `included_in_rollout`, or `outside_rollout`). A user listed in `userIds` is included whenever the flag itself is enabled. Other users are assigned a stable bucket from 0 to 99 using a SHA-256 hash of the flag key and user ID, so repeated evaluations stay consistent without storing per-user state.

Update only the fields that should change:

```sh
curl -X PATCH http://localhost:3000/flags/new-checkout \
  -H 'content-type: application/json' \
  -d '{"rolloutPercentage":50}'
```

Errors return JSON with an `error` message and an appropriate HTTP status: `400` for invalid input, `404` for missing flags/routes, and `409` for duplicate keys. Request bodies are limited to 32 KB.

## Assumptions and tradeoffs

- `src/flags.ts` contains the flag model, validation, in-memory storage, and evaluation logic.
- `src/server.ts` maps HTTP requests to the manager and formats responses.
- The project is API-first because the interview role is focused on backend development; `curl` examples make each user action directly exercisable.
- A flag is off by default. When enabled, explicit `userIds` are included first; remaining users are evaluated against the percentage rollout.
- The stable hash keeps rollout membership consistent across server restarts. It is a simple percentage rollout, not a cryptographic access-control mechanism.
- Persistence, authentication, per-environment configuration, and a UI are intentionally omitted to keep the exercise focused and explainable within a 60-minute interview.

## With another day

I would add persistent storage with a small repository interface, tests for validation and rollout boundary cases, and per-environment flag values. I would also add request IDs and structured logs, then consider an accessible UI if the project needed non-technical users to manage flags directly.
