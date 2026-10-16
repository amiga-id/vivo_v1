ALTER TABLE public.lead_audit_event
    ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE public.lead_audit_event
    DROP CONSTRAINT IF EXISTS lead_audit_event_actor_id_fkey;

ALTER TABLE public.lead_audit_event
    ADD CONSTRAINT lead_audit_event_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.account(id) ON DELETE SET NULL;
