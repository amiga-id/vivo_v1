import re
from textwrap import dedent
from time import monotonic
from uuid import UUID

from boto3 import Session
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from pydantic import BaseModel

from app.core.config import settings
from app.schemas.metric import MetricRequest
from app.services.metric import save_metric


class QueryDBResponse(BaseModel):
    success: bool
    error: str | None = None
    data: str | None = None


def validate_and_sanitize_sql(sql: str) -> str:
    """App-side guardrail to prevent destructive commands or unauthorized execution."""
    cleaned_sql = sql.strip().strip(";").lower()

    # Force the query to be a read-only SELECT query
    if not cleaned_sql.startswith("select"):
        raise ValueError(
            "The generated query is not a valid read-only SELECT operation.",
        )

    # Reject strings containing modification verbs
    forbidden_words = [
        "insert",
        "update",
        "delete",
        "drop",
        "truncate",
        "alter",
        "grant",
        "revoke",
    ]
    for word in forbidden_words:
        # Match word boundaries to prevent false positives on columns like "updated_at"
        if re.search(r"\b" + word + r"\b", cleaned_sql):
            raise ValueError(
                f"Security Alert: Dangerous keyword '{word}' detected.",
            )

    return sql


def get_bedrock_client(service_name: str = "bedrock-runtime") -> BaseClient:
    """
    Initializes a Boto3 Bedrock Runtime client.
    Boto3 automatically picks up AWS_BEARER_TOKEN_BEDROCK from the environment.
    """
    session = Session(
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )

    return session.client(service_name=service_name, region_name=settings.AWS_REGION)


async def query_db(
    account_id: UUID,
    prompt: str,
    model_id: str = settings.AWS_BEDROCK_MODEL_ID,
    temperature: float = settings.AWS_BEDROCK_TEMPERATURE,
):
    exec_start = monotonic()
    metric = MetricRequest(
        name="query_db",
        correlated_id="",
        account_id=account_id,
        created_by=account_id,
    )
    try:
        client = get_bedrock_client("bedrock-runtime")
        metric.service_name = (
            client.meta.service_model.service_name or "bedrock-runtime"
        )

        DB_SCHEMA_CONTEXT = dedent("""
        You are a strict, highly accurate PostgreSQL database expert.
        Use only the following tables and columns from the current database migrations.
        UUID primary keys default to uuidv7() unless otherwise stated.

        1. public.account
        - id uuid PRIMARY KEY
        - name varchar(100) NOT NULL
        - email varchar(255) NOT NULL UNIQUE
        - email_verified boolean NOT NULL
        - phone_number varchar(15)
        - phone_verified boolean NOT NULL
        - password_hash varchar(255) NOT NULL
        - role public.account_role_enum NOT NULL; values: 'system', 'admin',
          'support', 'reviewer', 'lead'
        - avatar_url varchar(255)
        - avatar_provider varchar(10)
        - about varchar(255)
        - last_login timestamptz
        - last_logout timestamptz
        - created_at timestamptz NOT NULL DEFAULT now()
        - updated_at timestamptz

        2. public.vendor
        - id uuid PRIMARY KEY
        - account_id uuid REFERENCES public.account(id) ON DELETE SET NULL
        - name varchar(255) NOT NULL
        - pic varchar(255) NOT NULL
        - email varchar(255) NOT NULL
        - phone_number varchar(255)
        - address varchar(255)
        - created_by uuid NOT NULL
        - created_at timestamptz NOT NULL DEFAULT now()
        - updated_by uuid
        - updated_at timestamptz

        3. public.client
        - id uuid PRIMARY KEY
        - name varchar(255) NOT NULL
        - created_by uuid NOT NULL REFERENCES public.account(id)
        - created_at timestamptz NOT NULL DEFAULT now()
        - vendor_id uuid REFERENCES public.vendor(id); UNIQUE when not null

        4. public.client_assignment
        - id uuid PRIMARY KEY
        - support_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE
        - client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE CASCADE
        - UNIQUE (support_id, client_id)

        5. public.submission
        - id uuid PRIMARY KEY
        - request_number varchar(32) NOT NULL UNIQUE
        - client_id uuid NOT NULL REFERENCES public.client(id)
        - kind varchar(100) NOT NULL
        - channel varchar(100)
        - receive_date date NOT NULL
        - note varchar(2000)
        - approvers integer NOT NULL DEFAULT 1; allowed values: 1, 2
        - uploader_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE
        - reviewer_id uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT
        - due_date date NOT NULL
        - status varchar(32) NOT NULL DEFAULT 'Dalam Review'
        - decision_reason varchar(2000)
        - files jsonb NOT NULL
        - invoices jsonb NOT NULL
        - invoice_count integer NOT NULL DEFAULT 0
        - page_count integer NOT NULL DEFAULT 0
        - grand_total numeric(18, 2) NOT NULL DEFAULT 0
        - tax jsonb NOT NULL DEFAULT '[]'::jsonb
        - created_at timestamptz NOT NULL DEFAULT now()
        - revision_of_id uuid REFERENCES public.submission(id) ON DELETE RESTRICT
        - voucher_number varchar(64)
        - voucher_s3_key varchar(1024)

        6. public.uploaded_file
        - id uuid PRIMARY KEY
        - uploader_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE
        - submission_id uuid REFERENCES public.submission(id) ON DELETE SET NULL
        - file_name varchar(255) NOT NULL
        - file_size integer NOT NULL
        - s3_key varchar(1024) NOT NULL UNIQUE
        - page_count integer
        - invoices jsonb
        - invoice_count integer NOT NULL DEFAULT 0
        - grand_total numeric(18, 2)
        - extraction_status varchar(16) NOT NULL DEFAULT 'pending'
        - extraction_error text
        - created_at timestamptz NOT NULL DEFAULT now()

        7. public.metric
        - id uuid PRIMARY KEY
        - name varchar(255) NOT NULL
        - service_name varchar(255) NOT NULL
        - correlated_id uuid
        - model_id varchar(255)
        - input_tokens integer
        - output_tokens integer
        - total_tokens integer
        - exec_start double precision
        - exec_time double precision
        - system text
        - prompt text
        - response text
        - success boolean NOT NULL
        - error text
        - created_by uuid NOT NULL
        - created_at timestamptz NOT NULL DEFAULT now()

        8. public.revision_history
        - id uuid PRIMARY KEY
        - submission_id uuid NOT NULL REFERENCES public.submission(id) ON DELETE RESTRICT
        - actor_id uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT
        - actor_name varchar(100) NOT NULL
        - actor_role varchar(16) NOT NULL; allowed values: 'Financial', 'Intake'
        - event_type varchar(32) NOT NULL
        - action varchar(255) NOT NULL
        - detail varchar(2000)
        - created_at timestamptz NOT NULL DEFAULT now()
        - UNIQUE (submission_id, event_type)

        9. public.lead_audit_event
        - id uuid PRIMARY KEY
        - actor_id uuid REFERENCES public.account(id) ON DELETE SET NULL
        - actor_name varchar(100) NOT NULL
        - entity_type varchar(32) NOT NULL
        - entity_id uuid
        - entity_label varchar(255)
        - action varchar(255) NOT NULL
        - detail text
        - created_at timestamptz NOT NULL DEFAULT now()

        10. public.voucher_signer
        - id uuid PRIMARY KEY
        - role varchar(16) NOT NULL; allowed values: 'admin', 'finance', 'bod'
        - account_id uuid REFERENCES public.account(id) ON DELETE RESTRICT
        - external_name varchar(100)
        - s3_key varchar(1024) NOT NULL
        - content_type varchar(64) NOT NULL
        - is_active boolean NOT NULL DEFAULT true
        - created_by uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT
        - created_at timestamptz NOT NULL DEFAULT now()
        - updated_at timestamptz
        - Exactly one signer identity: account_id, or external_name for role 'bod'
        - UNIQUE (account_id, role); UNIQUE (external_name, role)

        11. public.voucher_signature
        - id uuid PRIMARY KEY
        - submission_id uuid NOT NULL REFERENCES public.submission(id) ON DELETE CASCADE
        - role varchar(16) NOT NULL; allowed values: 'admin', 'finance', 'bod'
        - signer_id uuid NOT NULL REFERENCES public.voucher_signer(id) ON DELETE RESTRICT
        - applied_by uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT
        - applied_at timestamptz NOT NULL DEFAULT now()
        - UNIQUE (submission_id, role)

        Rules for generating the query:
        - Generate ONLY a single, valid, raw executable PostgreSQL SELECT query.
        - Do NOT wrap the query in markdown blocks (like ```sql), code tags, or explain your reasoning.
        - Output ONLY the query string starting with SELECT.
        - Use only the tables and columns listed above. Do not assume other tables,
          columns, enum types, or enum values exist.
        - Never select account.password_hash or metric.system, metric.prompt, or
          metric.response; these columns may contain credentials or sensitive content.
        """)  # noqa: E501

        inference_config = {"temperature": temperature}
        system_prompt = [{"text": DB_SCHEMA_CONTEXT}]
        metric.system = system_prompt

        user_prompt = [
            {
                "role": "user",
                "content": [
                    {"text": f"Generate a SQL query for this request: {prompt}"}
                ],
            }
        ]
        metric.prompt = user_prompt

        exec_time = round(monotonic() - exec_start, 2)
        response = client.converse(
            modelId=model_id,
            inferenceConfig=inference_config,
            system=system_prompt,
            messages=user_prompt,
        )

        generated_sql = response["output"]["message"]["content"][0]["text"].strip()
        safe_sql = validate_and_sanitize_sql(generated_sql)
        metric.response = safe_sql

        usage = response.get("usage", {})
        if usage is not None:
            metric.input_tokens = usage.get("inputTokens", 0)
            metric.output_tokens = usage.get("outputTokens", 0)
            metric.total_tokens = usage.get("totalTokens", 0)
            metric.exec_start = exec_start
            metric.exec_time = exec_time

        metric.success = True
        await save_metric(metric)

        return QueryDBResponse(
            success=True,
            data=safe_sql,
        )
    except ClientError as e:
        metric.success = False
        metric.error = e.response["Error"]["Message"]
    except Exception as e:
        metric.success = False
        metric.error = str(e)

    await save_metric(metric)

    return QueryDBResponse(success=False, error=metric.error)
