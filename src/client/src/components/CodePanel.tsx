import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";

const lang = (p: string) => {
  if (/\.(tsx?|jsx?|mjs)$/.test(p)) return javascript({ jsx: true, typescript: /\.tsx?$/.test(p) });
  if (/\.html?$/.test(p)) return html();
  if (/\.css$/.test(p)) return css();
  if (/\.json$/.test(p)) return json();
  if (/\.py$/.test(p)) return python();
  return [];
};

type Props = { path: string | null; content: string; live: boolean; onEdit: (v: string) => void };

/** CodeMirror 6. `content` changes from outside (file watcher / live stream) are applied
 *  as transactions that keep the cursor and scroll to the newest line while live. */
export default function CodePanel({ path, content, live, onEdit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langC = useRef(new Compartment());
  const roC = useRef(new Compartment());
  const editCb = useRef(onEdit);
  editCb.current = onEdit;
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: "",
        extensions: [basicSetup, oneDark, langC.current.of([]), roC.current.of([]),
          EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { fontFamily: "var(--mono)", fontSize: "13px" } }),
          EditorView.updateListener.of((u) => { if (u.docChanged && u.transactions.some((t) => t.isUserEvent("input") || t.isUserEvent("delete"))) editCb.current(u.state.doc.toString()); })],
      }),
    });
    return () => view.current?.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (path !== lastPath.current) {
      lastPath.current = path;
      v.dispatch({ effects: langC.current.reconfigure(path ? lang(path) : []) });
    }
    v.dispatch({ effects: roC.current.reconfigure(EditorState.readOnly.of(live)) });
    const cur = v.state.doc.toString();
    if (cur !== content) {
      let from = 0;
      const max = Math.min(cur.length, content.length);
      while (from < max && cur.charCodeAt(from) === content.charCodeAt(from)) from++;   // diff only the tail
      v.dispatch({ changes: { from, to: cur.length, insert: content.slice(from) },
        selection: live ? { anchor: content.length } : undefined,
        effects: live ? EditorView.scrollIntoView(content.length, { y: "end" }) : undefined });
    }
  }, [path, content, live]);

  return <div className="code-host" ref={host} />;
}
