ALTER TABLE public.submission
    ADD COLUMN IF NOT EXISTS revision_of_id uuid
    REFERENCES public.submission(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_revision_of
    ON public.submission (revision_of_id)
    WHERE revision_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.revision_history
(
    id uuid NOT NULL DEFAULT uuidv7(),
    submission_id uuid NOT NULL REFERENCES public.submission(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT,
    actor_name character varying(100) NOT NULL,
    actor_role character varying(16) NOT NULL
        CHECK (actor_role IN ('Financial', 'Intake')),
    event_type character varying(32) NOT NULL,
    action character varying(255) NOT NULL,
    detail character varying(2000),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT revision_history_pkey PRIMARY KEY (id),
    CONSTRAINT uq_revision_history_submission_event UNIQUE (submission_id, event_type)
);

CREATE INDEX IF NOT EXISTS ix_revision_history_submission_created
    ON public.revision_history (submission_id, created_at);
