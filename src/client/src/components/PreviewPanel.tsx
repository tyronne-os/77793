import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export type PreviewHandle = { reload: () => void };
type Props = { running: boolean; starting: boolean; error: string | null; onStart: () => void };

const PreviewPanel = forwardRef<PreviewHandle, Props>(({ running, starting, error, onStart }, ref) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(0);
  useImperativeHandle(ref, () => ({ reload: () => setNonce((n) => n + 1) }));

  if (!running) {
    return (
      <div className="preview-empty">
        <div className="crane-mark" aria-hidden>🏗️</div>
        <h3>{starting ? "Starting your project…" : "Nothing running yet"}</h3>
        <p>{starting ? "First run installs dependencies, this can take a minute." : "Start the preview, or just ask Berylize to build something."}</p>
        {error && <pre className="err">{error}</pre>}
        {!starting && <button className="btn primary" onClick={onStart}>▶ Start preview</button>}
      </div>
    );
  }
  return <iframe key={nonce} ref={frame} className="preview-frame" title="preview" src="http://localhost:8001"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />;
});
export default PreviewPanel;
