import { LinkButton } from "@/components/ui";
export default function Forbidden() {
  return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><h1 className="text-5xl font-bold">No access</h1><p className="mt-2 text-mute">This area is for Vybe Market admins only.</p><LinkButton href="/" className="mt-5">Go to Vybe Market</LinkButton></div></main>;
}
