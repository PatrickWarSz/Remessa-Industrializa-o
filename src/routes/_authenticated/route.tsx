import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasInternalAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession renova sozinho o token quando preciso: o navegador continua liberado.
    const { data } = await supabase.auth.getSession();
    if (!hasInternalAccess(data.session)) {
      // sessão antiga (do login por e-mail) ou inexistente: volta para a senha
      if (data.session) await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.session!.user };
  },
  component: () => <Outlet />,
});
