import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta · Remessa" },
      { name: "description", content: "Trocar e-mail e senha de acesso." },
      { property: "og:title", content: "Minha conta · Remessa" },
      { property: "og:description", content: "Trocar e-mail e senha de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Conta,
});

const input = "w-full rounded border border-input bg-background px-3 py-2 text-sm";
const btn = "rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";

function Conta() {
  const [current, setCurrent] = useState("");
  const [email, setEmail] = useState("");
  const [curPass, setCurPass] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrent(data.user?.email ?? ""));
  }, []);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: window.location.origin },
    );
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data.user?.email === email.trim()) {
      setCurrent(data.user.email);
      toast.success("E-mail alterado. Use o novo e-mail no próximo login.");
    } else {
      toast.success("Confirme a troca pelo link enviado ao novo e-mail.");
    }
    setEmail("");
  }

  async function changePass(e: React.FormEvent) {
    e.preventDefault();
    if (pass.length < 6) { toast.error("A senha precisa de pelo menos 6 caracteres."); return; }
    if (pass !== pass2) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: pass,
      ...(curPass ? { current_password: curPass } : {}),
    } as Parameters<typeof supabase.auth.updateUser>[0]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha alterada.");
    setCurPass("");
    setPass("");
    setPass2("");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Minha conta</h1>
          <p className="text-sm text-muted-foreground">
            Os dados gravados continuam na mesma conta. Só muda o acesso.
          </p>
        </div>
        <form onSubmit={changeEmail} className="space-y-3 rounded border border-border p-4">
          <h2 className="font-semibold">Trocar e-mail</h2>
          <p className="text-xs text-muted-foreground">Atual: {current}</p>
          <input type="email" required placeholder="Novo e-mail" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={busy} className={btn}>Salvar e-mail</button>
        </form>
        <form onSubmit={changePass} className="space-y-3 rounded border border-border p-4">
          <h2 className="font-semibold">Trocar senha</h2>
          <input type="password" placeholder="Senha atual" className={input} value={curPass} onChange={(e) => setCurPass(e.target.value)} />
          <input type="password" required placeholder="Nova senha" className={input} value={pass} onChange={(e) => setPass(e.target.value)} />
          <input type="password" required placeholder="Repita a nova senha" className={input} value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <button disabled={busy} className={btn}>Salvar senha</button>
        </form>
      </div>
    </AppShell>
  );
}
