CREATE TABLE public.cuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cut_number text NOT NULL DEFAULT '',
  cut_on date NOT NULL DEFAULT CURRENT_DATE,
  group_name text NOT NULL DEFAULT '',
  model_label text NOT NULL DEFAULT '',
  fabric text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  qty_p integer NOT NULL DEFAULT 0,
  qty_m integer NOT NULL DEFAULT 0,
  qty_g integer NOT NULL DEFAULT 0,
  qty_gg integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  file_path text,
  file_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuts TO authenticated;
GRANT ALL ON public.cuts TO service_role;
ALTER TABLE public.cuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal access only" ON public.cuts FOR ALL TO authenticated USING (public.is_internal_app()) WITH CHECK (public.is_internal_app());
CREATE POLICY "cut sheets internal read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cut-sheets' AND public.is_internal_app());
CREATE POLICY "cut sheets internal insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cut-sheets' AND public.is_internal_app());
CREATE POLICY "cut sheets internal delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cut-sheets' AND public.is_internal_app());