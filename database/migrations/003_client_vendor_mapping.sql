ALTER TABLE public.client
    DROP CONSTRAINT IF EXISTS client_name_key;

ALTER TABLE public.client
    ADD COLUMN IF NOT EXISTS vendor_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'client_vendor_id_fkey'
          AND conrelid = 'public.client'::regclass
    ) THEN
        ALTER TABLE public.client
            ADD CONSTRAINT client_vendor_id_fkey
            FOREIGN KEY (vendor_id) REFERENCES public.vendor(id);
    END IF;
END $$;

WITH unique_vendor_names AS (
    SELECT lower(name) AS normalized_name, (array_agg(id))[1] AS vendor_id
    FROM public.vendor
    GROUP BY lower(name)
    HAVING count(*) = 1
)
UPDATE public.client AS client
SET vendor_id = vendor.vendor_id
FROM unique_vendor_names AS vendor
WHERE client.vendor_id IS NULL
  AND lower(client.name) = vendor.normalized_name;

INSERT INTO public.client (name, created_by, vendor_id)
SELECT vendor.name,
       COALESCE(
           (SELECT account.id
            FROM public.account AS account
            WHERE account.id = vendor.created_by),
           (SELECT account.id
            FROM public.account AS account
            ORDER BY account.created_at
            LIMIT 1)
       ),
       vendor.id
FROM public.vendor AS vendor
WHERE NOT EXISTS (
    SELECT 1
    FROM public.client AS client
    WHERE client.vendor_id = vendor.id
)
  AND EXISTS (SELECT 1 FROM public.account);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_client_vendor'
          AND conrelid = 'public.client'::regclass
    ) THEN
        ALTER TABLE public.client
            ADD CONSTRAINT uq_client_vendor UNIQUE (vendor_id);
    END IF;
END $$;
