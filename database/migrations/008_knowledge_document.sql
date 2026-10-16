CREATE TABLE IF NOT EXISTS public.knowledge_document
(
    id uuid NOT NULL DEFAULT uuidv7(),
    slug character varying(120) NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    source character varying(512) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT knowledge_document_pkey PRIMARY KEY (id),
    CONSTRAINT uq_knowledge_document_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_knowledge_document_search
    ON public.knowledge_document
    USING gin (to_tsvector('simple'::regconfig, title || ' ' || content));
