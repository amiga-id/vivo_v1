CREATE TABLE IF NOT EXISTS public.metric
(
    id uuid NOT NULL DEFAULT uuidv7(),
    name character varying(255) NOT NULL,
    service_name character varying(255) NOT NULL,
    correlated_id uuid,
    model_id character varying(255),
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    exec_start double precision,
    exec_time double precision,
    system text,
    prompt text,
    response text,
    success boolean NOT NULL,
    error text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT metric_pkey PRIMARY KEY (id)
)
