CREATE TABLE IF NOT EXISTS public.lead_audit_event
(
    id uuid NOT NULL DEFAULT uuidv7(),
    actor_id uuid NOT NULL REFERENCES public.account(id) ON DELETE RESTRICT,
    actor_name character varying(100) NOT NULL,
    entity_type character varying(32) NOT NULL,
    entity_id uuid,
    entity_label character varying(255),
    action character varying(255) NOT NULL,
    detail text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT lead_audit_event_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_lead_audit_event_created
    ON public.lead_audit_event (created_at DESC, id DESC);
