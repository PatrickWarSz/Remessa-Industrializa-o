-- Trava do banco: só sessões marcadas como "uso interno" (app_metadata.internal_app = true)
-- leem ou gravam. A marca só pode ser colocada pelo servidor (service role) depois de
-- conferir a senha de acesso; quem criar uma conta nova pela API NÃO recebe a marca.

CREATE OR REPLACE FUNCTION public.is_internal_app()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'internal_app')::boolean, false)
$$;

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','product_groups','factories','periods','sales_totals','shipments',
    'shipment_items','fabric_moves','resale_models','resale_code_map','resale_sales',
    'resale_cycles','counter_notes','counter_note_items','resale_cycle_allocations'
  ]
  LOOP
    -- remove todas as políticas antigas (inclusive as "abertas" para anon)
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY "internal access only" ON public.%I FOR ALL TO authenticated USING (public.is_internal_app()) WITH CHECK (public.is_internal_app())',
      t
    );
  END LOOP;
END $$;
