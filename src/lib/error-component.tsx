import type { ErrorComponentProps } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "Etwas ist gerissen. Lade die Seite neu.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-void px-6 text-center text-kern">
      <h1 className="text-lg font-medium">Kushim ist aus dem Tritt</h1>
      <p className="max-w-md text-sm break-words text-mist">{errorMessage(error)}</p>
    </main>
  );
}
