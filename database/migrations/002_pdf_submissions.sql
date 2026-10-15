CREATE TABLE IF NOT EXISTS public.client
(
    id uuid NOT NULL DEFAULT uuidv7(),
    name character varying(255) NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES public.account(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT client_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.client_assignment
(
    id uuid NOT NULL DEFAULT uuidv7(),
    support_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE CASCADE,
    CONSTRAINT client_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT uq_client_assignment UNIQUE (support_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.submission
(
    id uuid NOT NULL DEFAULT uuidv7(),
    request_number character varying(32) NOT NULL UNIQUE,
    client_id uuid NOT NULL REFERENCES public.client(id),
    kind character varying(100) NOT NULL,
    channel character varying(100),
    receive_date date NOT NULL,
    note character varying(2000),
    approvers integer NOT NULL DEFAULT 1 CHECK (approvers IN (1, 2)),
    uploader_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT,
    due_date date NOT NULL,
    status character varying(32) NOT NULL DEFAULT 'Dalam Review',
    decision_reason character varying(2000),
    files jsonb NOT NULL,
    invoices jsonb NOT NULL,
    invoice_count integer NOT NULL DEFAULT 0,
    page_count integer NOT NULL DEFAULT 0,
    grand_total numeric(18, 2) NOT NULL DEFAULT 0,
    tax jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT submission_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_submission_reviewer_status
    ON public.submission (reviewer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_submission_uploader_created
    ON public.submission (uploader_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.uploaded_file
(
    id uuid NOT NULL DEFAULT uuidv7(),
    uploader_id uuid NOT NULL REFERENCES public.account(id) ON DELETE CASCADE,
    submission_id uuid REFERENCES public.submission(id) ON DELETE SET NULL,
    file_name character varying(255) NOT NULL,
    file_size integer NOT NULL,
    s3_key character varying(1024) NOT NULL UNIQUE,
    page_count integer,
    invoices jsonb,
    invoice_count integer NOT NULL DEFAULT 0,
    grand_total numeric(18, 2),
    extraction_status character varying(16) NOT NULL DEFAULT 'pending',
    extraction_error text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uploaded_file_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_uploaded_file_uploader
    ON public.uploaded_file (uploader_id, created_at DESC);
