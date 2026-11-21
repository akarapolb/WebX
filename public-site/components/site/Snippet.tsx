// WebX site kit — a search result's passage with every match in <mark>.
import { snippetParts } from "@/lib/site/search";

export default function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const { parts, before, after } = snippetParts(text, terms);
  if (parts.length === 1) return <>{parts[0]}{after && "…"}</>;
  return (
    <>
      {before && "…"}
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
      {after && "…"}
    </>
  );
}
