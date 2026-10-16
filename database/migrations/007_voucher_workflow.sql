ALTER TABLE public.submission
    ADD COLUMN IF NOT EXISTS voucher_number character varying(64),
    ADD COLUMN IF NOT EXISTS voucher_s3_key character varying(1024);

CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_voucher_number
    ON public.submission (voucher_number)
    WHERE voucher_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.voucher_signer
(
    id uuid NOT NULL DEFAULT uuidv7(),
    role character varying(16) NOT NULL
        CHECK (role IN ('admin', 'finance', 'bod')),
    account_id uuid REFERENCES public.account(id) ON DELETE RESTRICT,
    external_name character varying(100),
    s3_key character varying(1024) NOT NULL,
    content_type character varying(64) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT voucher_signer_pkey PRIMARY KEY (id),
    CONSTRAINT ck_voucher_signer_identity CHECK (
        (account_id IS NOT NULL AND external_name IS NULL)
        OR (account_id IS NULL AND role = 'bod' AND external_name IS NOT NULL)
    ),
    CONSTRAINT uq_voucher_signer_account_role UNIQUE (account_id, role),
    CONSTRAINT uq_voucher_signer_external_name_role UNIQUE (external_name, role)
);

CREATE INDEX IF NOT EXISTS ix_voucher_signer_role_active
    ON public.voucher_signer (role, is_active);

CREATE TABLE IF NOT EXISTS public.voucher_signature
(
    id uuid NOT NULL DEFAULT uuidv7(),
    submission_id uuid NOT NULL
        REFERENCES public.submission(id) ON DELETE CASCADE,
    role character varying(16) NOT NULL
        CHECK (role IN ('admin', 'finance', 'bod')),
    signer_id uuid NOT NULL
        REFERENCES public.voucher_signer(id) ON DELETE RESTRICT,
    applied_by uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT,
    applied_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT voucher_signature_pkey PRIMARY KEY (id),
    CONSTRAINT uq_voucher_signature_submission_role UNIQUE (submission_id, role)
);
