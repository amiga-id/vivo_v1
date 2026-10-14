CREATE TYPE public.account_role_enum AS ENUM
    ('system', 'admin', 'support', 'reviewer', 'lead');

ALTER TYPE public.account_role_enum
    OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.account
(
    id uuid NOT NULL DEFAULT uuidv7(),
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    email_verified boolean NOT NULL,
    phone_number character varying(15) COLLATE pg_catalog."default",
    phone_verified boolean NOT NULL,
    password_hash character varying(255) COLLATE pg_catalog."default" NOT NULL,
    role account_role_enum NOT NULL,
    avatar_url character varying(255) COLLATE pg_catalog."default",
    avatar_provider character varying(10) COLLATE pg_catalog."default",
    about character varying(255) COLLATE pg_catalog."default",
    last_login timestamp with time zone,
    last_logout timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT account_pkey PRIMARY KEY (id),
    CONSTRAINT account_email_key UNIQUE (email)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.account
    OWNER to postgres;
