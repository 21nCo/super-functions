import content from "../../../../static/llms.txt?raw";

export const prerender = true;
export function GET() {
  return new Response(content, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
