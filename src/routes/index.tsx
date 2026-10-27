import { createFileRoute } from "@tanstack/react-router";
import { KushimApp } from "@/components/KushimApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <KushimApp />;
}
