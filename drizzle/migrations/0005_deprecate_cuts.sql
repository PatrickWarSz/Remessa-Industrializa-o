DROP POLICY IF EXISTS "cut sheets internal read" ON storage.objects;
DROP POLICY IF EXISTS "cut sheets internal insert" ON storage.objects;
DROP POLICY IF EXISTS "cut sheets internal delete" ON storage.objects;
COMMENT ON TABLE public.cuts IS 'DEPRECATED: módulo de cortes removido, não usado pelo app';