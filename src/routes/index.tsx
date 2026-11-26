import { createFileRoute } from "@tanstack/react-router";
import { Deck } from "@/components/player/deck";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Deck />;
}
