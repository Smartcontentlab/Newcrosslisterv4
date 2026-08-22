ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS marketplace_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.items.marketplace_details IS
  'Seller-entered Poshmark, Depop, Mercari, and category-specific listing details for canonical crosslisting.';
