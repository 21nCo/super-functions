import corpus from "../../../../static/llms-full.txt?raw";

export const prerender = true;

export function GET() {
  return new Response(corpus, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
