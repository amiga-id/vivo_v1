ALTER TABLE public.voucher_signer
    DROP CONSTRAINT IF EXISTS voucher_signer_role_check;

ALTER TABLE public.voucher_signer
    ADD CONSTRAINT voucher_signer_role_check
    CHECK (role IN ('admin', 'finance', 'support', 'lead', 'bod'));
