# Amiga VIVO Backend

FastAPI backend with account authentication, vendor management, and a development-only
demo API for the workflows shown in the frontend.

## Run locally

Install the backend environment and configure the required values from the repository
root documentation:

```powershell
uv sync --directory backend
uv run --directory backend fastapi dev --port 8001
```

Set `FASTAPI_ENV=development` or `APP_DEMO=true` to expose interactive API docs at
`/docs` and enable the demo endpoints. Demo endpoints return in-memory fixture data;
changes are lost when the process restarts and are not shared between instances.

## API overview

All API routes are under `/api/v1`. Standard responses use the envelope
`{"success": true, "data": ...}`; errors use `{"success": false, "error": ...}`.
Property names in the demo contract use the frontend's camelCase field names.

| Feature | Routes |
| --- | --- |
| Demo login | `POST /demo/auth/login` |
| Queue, workload, and audit | `GET /demo/queue`, `GET /demo/workload`, `GET /demo/audit` |
| Documents | `POST /demo/documents`, `GET /demo/documents/{id}` |
| Review | `PATCH /demo/documents/{id}/fields/{field}`, `POST /demo/documents/{id}/decision` |
| Tax and resubmission | `GET/PUT /demo/documents/{id}/tax`, `POST /demo/documents/{id}/resubmit` |
| Work allocation | `POST /demo/documents/{id}/reassign`, `GET /demo/assignments`, `PUT /demo/assignments/{support_id}` |
| Voucher | `GET /demo/vouchers`, `GET /demo/vouchers/{id}`, `POST /demo/vouchers/{id}/download` |
| Clients and assigned options | `GET/POST /demo/clients`, `GET /demo/client-options` |
| Users and access requests | `GET/POST /demo/users`, `PATCH /demo/users/{id}/role`, `GET /demo/access-requests`, `POST /demo/access-requests/{id}/decision` |

Demo requests identify the fixture user with the `X-Demo-User` header. If omitted,
the endpoint's documented sample user is used. Available accounts share the demo
password `amiga2026`:

| Role | Demo user |
| --- | --- |
| Intake Support | `dewi`, `eko`, `andi` |
| Finance Reviewer | `rina`, `hana` |
| Service Lead | `bayu` |
| System Admin | `sari` |

For example:

```powershell
curl.exe http://localhost:8001/api/v1/demo/queue -H "X-Demo-User: rina"
```

The `/demo` API is an API contract and sample workflow implementation only. The
frontend's business workflow screens still use in-memory demo data; login and account
management use the database-backed `/auth` routes. The demo document upload accepts
invoice metadata and a file name only; it does not transfer or persist document bytes.
Do not enable demo mode in production. `/auth` and `/vendors` routes use the configured
PostgreSQL database and bearer-token authentication.

System Admin can list vendors with `POST /api/v1/vendors` and add a vendor with
`POST /api/v1/vendors/create`. Vendor records require a company name, PIC, and email;
phone number and address are optional.

Support upload client choices are backed by vendor records. Apply
`database/migrations/003_client_vendor_mapping.sql` after the existing vendor and PDF
submission migrations; it preserves client IDs used by assignments and submissions
while linking them to vendor names. Creating a vendor through the API also creates its
client mapping.

`POST /api/v1/auth/login` verifies the account password against its database hash and
returns a bearer token. Send that token to `POST /api/v1/auth/me` to retrieve the
authenticated account, or `POST /api/v1/auth/logout` to invalidate its tokens. Account
listing, creation, and role changes require an administrator token. The frontend maps
the backend `reviewer` role to Finance Reviewer and both `system` and `admin` roles to
System Admin.

Self-service registration is disabled. An authenticated System Admin creates
accounts with `POST /api/v1/auth/accounts/create`, providing `name`, `email`,
`password`, and an optional `role` (`support`, `reviewer`, `lead`, or `admin`).
