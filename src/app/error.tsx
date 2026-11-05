"use client";
export default function Err({ reset }: { error: Error; reset: () => void }) {
  return <main className="grid min-h-[70vh] place-items-center p-6 text-center"><div><h1 className="text-3xl font-bold">This page didn't load</h1><p className="mt-2 text-mute">Try again. If it keeps happening, come back in a few minutes.</p><button onClick={reset} className="mt-4 rounded-xl bg-palm px-4 py-2.5 font-semibold text-white">Try again</button></div></main>;
}
