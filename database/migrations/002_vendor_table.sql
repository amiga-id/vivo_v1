CREATE TABLE IF NOT EXISTS public.vendor
(
    id uuid NOT NULL DEFAULT uuidv7(),
    account_id uuid,
    name character varying(255) NOT NULL,
    pic character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone_number character varying(255),
    address character varying(255),
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_by uuid,
    updated_at timestamp with time zone,
    CONSTRAINT vendor_pkey PRIMARY KEY (id),
    CONSTRAINT vendor_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES public.account (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)
