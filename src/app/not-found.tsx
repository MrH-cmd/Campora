import { LinkButton } from "@/components/ui";
export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><h1 className="text-5xl font-bold">Page not found</h1><p className="mt-2 text-mute">It may have been moved or taken down.</p><LinkButton href="/" className="mt-5">Go to Vybe Market</LinkButton></div></main>;
}
