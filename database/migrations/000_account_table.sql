CREATE TYPE public.account_role_enum AS ENUM
    ('system', 'admin', 'support', 'reviewer', 'lead');

CREATE TABLE IF NOT EXISTS public.account
(
    id uuid NOT NULL DEFAULT uuidv7(),
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    email_verified boolean NOT NULL,
    phone_number character varying(15),
    phone_verified boolean NOT NULL,
    password_hash character varying(255) NOT NULL,
    role account_role_enum NOT NULL,
    avatar_url character varying(255),
    avatar_provider character varying(10),
    about character varying(255),
    last_login timestamp with time zone,
    last_logout timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT account_pkey PRIMARY KEY (id),
    CONSTRAINT account_email_key UNIQUE (email)
)
