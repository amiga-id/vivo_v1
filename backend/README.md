# Amiga VIVO Backend

FastAPI backend with account authentication, vendor management, database-backed Lead
workload and assignments, and a development-only demo API.

## Run locally

Install the backend environment and configure the required values from the repository
root documentation:

```powershell
uv sync --directory backend
uv run --directory backend uvicorn app.main:app --reload --port 8000
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
| Demo queue, workload, and audit | `GET /demo/queue`, `GET /demo/workload`, `GET /demo/audit` |
| Documents | `POST /demo/documents`, `GET /demo/documents/{id}` |
| Review | `PATCH /demo/documents/{id}/fields/{field}`, `POST /demo/documents/{id}/decision` |
| Tax and resubmission | `GET/PUT /demo/documents/{id}/tax`, `POST /demo/documents/{id}/resubmit` |
| Work allocation | `POST /demo/documents/{id}/reassign`, `GET /demo/assignments`, `PUT /demo/assignments/{support_id}` |
| Voucher | `GET /demo/vouchers`, `GET /demo/vouchers/{id}`, `POST /demo/vouchers/{id}/download` |
| Clients and assigned options | `GET/POST /demo/clients`, `GET /demo/client-options` |
| Users and access requests | `GET/POST /demo/users`, `PATCH /demo/users/{id}/role`, `GET /demo/access-requests`, `POST /demo/access-requests/{id}/decision` |
| Vendors | `POST /vendors`, `POST /vendors/create`, `PUT /vendors/{id}`, `DELETE /vendors/{id}` |
| Lead workload and audit | `GET /lead/workload`, `PATCH /lead/workload/{submission_id}/reviewer`, `GET /lead/audit`, `GET /lead/support-accounts` |
| Database-backed audit | `GET /audit/events` |
| Admin dashboard summary | `GET /admin/dashboard` |
| Authenticated Agentic Knowledge Chatbot | `POST /rag/ask-agent` |
| Client assignments | `GET /clients`, `GET /clients/assignments`, `PUT /clients/assignments/{support_id}` |

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
curl.exe http://localhost:8000/api/v1/demo/queue -H "X-Demo-User: rina"
```

The `/demo` API is an API contract and sample workflow implementation only. Login and
account management use the database-backed `/auth` routes. The demo document upload accepts
invoice metadata and a file name only; it does not transfer or persist document bytes.
Do not enable demo mode in production. `/auth` and `/vendors` routes use the configured
PostgreSQL database and bearer-token authentication.

The `/lead` endpoints use bearer-token authentication and require the Service Lead role.
The Lead workload response contains only status, client, reviewer, uploader, and due-date
metadata; it does not return invoice contents or transaction totals. Lead can reassign
open submissions to Finance reviewers and manage Intake Support client assignments.
Assignment changes and reviewer reassignments are persisted in `lead_audit_event`.
Support, Finance, Lead, and Admin audit screens use the shared database-backed
`GET /api/v1/audit/events` endpoint, with results scoped to the authenticated role.
The System Admin dashboard summary is served from database aggregates by
`GET /api/v1/admin/dashboard`.
Approved submissions are listed at `GET /api/v1/documents/vouchers`. Admin can
create Support, Finance, Lead, and Admin accounts with an optional PNG/JPEG
signature using `POST /api/v1/auth/accounts/create-with-signature`; Finance
accounts require a signature. Signature images are stored in S3, while signer
metadata and S3 keys are stored in the database. An existing Finance account can
replace its own signature with
`POST /api/v1/documents/signatures/finance`. Approving a submission associates
the reviewer's registered Finance signature with that submission, and voucher
generation applies it automatically without asking Finance to select a signature
again. The BOD signature area is left blank for the BOD to sign manually; the
application stores signatures submitted during account creation for all supported
employee roles, while automatic voucher signing remains limited to Finance.
Vouchers are generated or refreshed with
`POST /api/v1/documents/submissions/{submission_id}/voucher`. Source invoice PDFs
are appended after the generated voucher page and voucher and Finance signature
files are stored in the configured S3 bucket. Finance sees assigned submissions;
Support can only view vouchers for its own submissions.

Apply `database/migrations/007_voucher_workflow.sql`,
`database/migrations/008_knowledge_document.sql`, and
`database/migrations/009_all_role_signatures.sql` before running this version.
The authenticated chatbot uses the RAG-specific `BEDROCK_MODEL_ID` setting when
configured, then falls back to `AWS_BEDROCK_MODEL_ID`. Configure a model or
inference profile available in the selected Bedrock region. Chatbot SOP and policy
knowledge is stored and searched in the application PostgreSQL database; the
backend seeds the initial documents from repository documentation when it starts.
No AWS Knowledge Base is used. Its read-only data tools derive the user and role
from the bearer token; no user ID or role is accepted from the chat request. Tool
access is scoped to the active Support uploader, Finance reviewer, Lead workflow,
or Admin role. Chatbot conversation history remains in the current authenticated
browser session and is not stored as a separate database log. Bedrock is used only
for language-model inference and uses `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` from backend settings.
Workflow changes, account administration, uploads, and successful login/logout
activity are stored in `lead_audit_event`. Apply migrations
`database/migrations/005_lead_audit_event.sql` and
`database/migrations/006_audit_actor_retention.sql` before deploying this version.

System Admin can list vendors with `POST /api/v1/vendors` and add a vendor with
`POST /api/v1/vendors/create`, edit vendor details with `PUT /api/v1/vendors/{id}`, and
delete a vendor with `DELETE /api/v1/vendors/{id}`. Vendor records require a company
name, PIC, and email; phone number and address are optional. Editing a vendor also
updates its linked client name. Deleting a vendor removes it from new client choices
while preserving the client record needed by historical submissions.

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
