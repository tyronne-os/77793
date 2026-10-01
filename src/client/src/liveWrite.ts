// Pulls the file Qwen is *currently typing* out of its half-streamed reply, so the
// editor can show code appearing live, before the tool call is even finished.

export type Live = { path: string; content: string; done: boolean } | null;

const unescape = (s: string) => {
  let t = s.endsWith("\\") && !s.endsWith("\\\\") ? s.slice(0, -1) : s;   // dangling escape mid-stream
  t = t.replace(/\\u[0-9a-fA-F]{0,3}$/, "");
  try { return JSON.parse(`"${t}"`) as string; }
  catch { return t.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
};

export function liveWrite(text: string): Live {
  const start = text.lastIndexOf("<tool_call>");
  if (start < 0) return null;
  const call = text.slice(start);
  if (!/"name"\s*:\s*"write_file"/.test(call)) return null;
  const path = /"path"\s*:\s*"([^"]+)"/.exec(call)?.[1];
  const m = /"content"\s*:\s*"((?:[^"\\]|\\.)*)("?)/s.exec(call);
  if (!path || !m) return null;
  return { path, content: unescape(m[1]), done: m[2] === '"' || call.includes("</tool_call>") };
}

/** Chat text with tool-call blocks swapped for short markers. */
export function splitReply(text: string): Array<{ kind: "text" | "tool"; value: string; open?: boolean }> {
  const out: Array<{ kind: "text" | "tool"; value: string; open?: boolean }> = [];
  const re = /<tool_call>([\s\S]*?)(<\/tool_call>|$)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    const name = /"name"\s*:\s*"(\w+)"/.exec(m[1])?.[1] ?? "tool";
    const target = /"path"\s*:\s*"([^"]+)"/.exec(m[1])?.[1] ?? /"command"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(m[1])?.[1] ?? "";
    out.push({ kind: "tool", value: `${name} ${target}`.trim(), open: !m[2] });
    last = re.lastIndex;
    if (!m[2]) break;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.filter((p) => p.kind === "tool" || p.value.trim());
}
