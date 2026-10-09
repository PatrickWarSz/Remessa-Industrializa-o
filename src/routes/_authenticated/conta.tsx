import { createFileRoute, redirect } from "@tanstack/react-router";

// O acesso agora é por senha única; não há mais conta/e-mail para editar.
export const Route = createFileRoute("/_authenticated/conta")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
