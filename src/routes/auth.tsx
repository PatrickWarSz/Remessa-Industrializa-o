import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { unlockApp } from "@/lib/access.functions";
import { hasInternalAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso — Central de Remessa" },
      { name: "description", content: "Acesso interno ao sistema de vendas, remessa e industrialização." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Navegador já liberado antes: entra direto, sem pedir nada.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (hasInternalAccess(data.session)) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    try {
      const res = await unlockApp({ data: { password } });
      if (!res.ok) {
        toast.error(res.error);
        setPassword("");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) throw error;
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível liberar o acesso");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-2 font-extrabold tracking-tight">
          <Factory className="size-5 text-accent" />
          <span>REMESSA</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="access-password">Senha de acesso</Label>
          <Input
            id="access-password"
            type="password"
            autoFocus
            autoComplete="off"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
