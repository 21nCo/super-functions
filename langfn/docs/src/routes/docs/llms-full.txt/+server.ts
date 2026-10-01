import content from "../../../../static/llms-full.txt?raw";

export function GET() {
  return new Response(content, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
