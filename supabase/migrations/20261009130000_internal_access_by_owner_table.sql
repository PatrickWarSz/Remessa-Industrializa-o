-- Troca a regra de acesso: em vez de uma marca no token (que exigia a chave de serviço),
-- o banco consulta uma lista fechada de contas liberadas (public.app_allowed_users).
-- Quem criar conta nova pela API não está na lista e não enxerga nada.

CREATE TABLE IF NOT EXISTS public.app_allowed_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.app_allowed_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_allowed_users FROM anon, authenticated;
GRANT ALL ON public.app_allowed_users TO service_role;

CREATE OR REPLACE FUNCTION public.is_internal_app()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_allowed_users WHERE user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_internal_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_internal_app() TO authenticated;

-- Libera a conta que é dona dos dados já gravados.
INSERT INTO public.app_allowed_users (user_id)
SELECT user_id FROM (
  SELECT user_id FROM public.periods WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id FROM public.companies WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id FROM public.factories WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id FROM public.product_groups WHERE user_id IS NOT NULL
) x
GROUP BY user_id
ORDER BY count(*) DESC
LIMIT 1
ON CONFLICT DO NOTHING;
