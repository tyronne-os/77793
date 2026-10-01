export type TreeItem = { path: string; name: string; dir: boolean; depth: number };

export default function FileTree({ items, active, touched, onOpen }:
  { items: TreeItem[]; active: string | null; touched: Set<string>; onOpen: (p: string) => void }) {
  if (!items.length) return <div className="tree-empty">No files yet.<br />Ask Qwen to build something.</div>;
  return (
    <ul className="tree">
      {items.map((t) => (
        <li key={t.path}>
          <button className={`tree-row ${t.path === active ? "on" : ""} ${t.dir ? "dir" : ""}`}
            style={{ paddingLeft: 10 + t.depth * 14 }} disabled={t.dir} onClick={() => onOpen(t.path)}>
            <span className="ico">{t.dir ? "▾" : "·"}</span>{t.name}
            {touched.has(t.path) && <span className="dot" title="changed by Qwen" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
