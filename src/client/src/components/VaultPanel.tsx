/**
 * CRANE Secure Token Vault
 *
 * Tokens are sent to the backend ONCE (POST /api/vault/set), stored in
 * ~/.crane_vault.env (chmod 600), and never returned by the API.
 * The backend tests connectivity immediately after storing.
 *
 * GCP doesn't use a token — it uses gcloud CLI auth from the terminal.
 * GitHub has an extra "Create CRANE SHIPPED repo" action.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const SERVICES = [
  { id: "huggingface", label: "Hugging Face",           icon: "🤗", placeholder: "hf_…",          hint: "Profile → Access Tokens → New token (write)" },
  { id: "github",      label: "GitHub",                  icon: "🐙", placeholder: "ghp_… or github_pat_…", hint: "Settings → Developer settings → PAT (classic)" },
  { id: "nvidia_ngc",  label: "NVIDIA NGC",              icon: "⚡", placeholder: "NGC API key",   hint: "ngc.nvidia.com → Setup → Get API Key" },
  { id: "nvidia_ent",  label: "NVIDIA Enterprise",       icon: "🖥", placeholder: "Enterprise key", hint: "NVIDIA Enterprise portal → API keys" },
  { id: "gcp",         label: "Google Cloud (gcloud)",   icon: "☁️", placeholder: null,             hint: "Run: gcloud auth login  in the CRANE terminal" },
  { id: "jev",         label: "JEV",                     icon: "🔑", placeholder: "••••••••",       hint: "Space secret — handled by the deployment pipeline" },
  { id: "gemini",      label: "Gemini",                  icon: "♊", placeholder: "AIza…",           hint: "aistudio.google.com → Get API key" },
  { id: "openai",      label: "OpenAI",                  icon: "🤖", placeholder: "sk-…",            hint: "platform.openai.com → API keys" },
] as const;

type ServiceId = typeof SERVICES[number]["id"];
type ServiceStatus = { configured: boolean; testing: boolean; ok?: boolean; message?: string };

export default function VaultPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [statuses, setStatuses] = useState<Record<ServiceId, ServiceStatus>>(() =>
    Object.fromEntries(SERVICES.map(s => [s.id, { configured: false, testing: false }])) as Record<ServiceId, ServiceStatus>
  );
  const [inputs, setInputs] = useState<Record<ServiceId, string>>(
    () => Object.fromEntries(SERVICES.map(s => [s.id, ""])) as Record<ServiceId, string>
  );
  const [githubRepo, setGithubRepo] = useState("");
  const [repoResult, setRepoResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  const [creatingRepo, setCreatingRepo] = useState(false);

  // Load which services are already configured
  const loadStatus = useCallback(async () => {
    const data: Record<string, boolean> = await fetch("/api/vault").then(r => r.json()).catch(() => ({}));
    setStatuses(prev => {
      const next = { ...prev };
      for (const [id, configured] of Object.entries(data)) {
        next[id as ServiceId] = { ...next[id as ServiceId], configured };
      }
      return next;
    });
  }, []);

  useEffect(() => { if (open) loadStatus(); }, [open, loadStatus]);

  const setInput = (id: ServiceId, val: string) =>
    setInputs(prev => ({ ...prev, [id]: val }));

  const save = async (id: ServiceId) => {
    const token = inputs[id].trim();
    if (!token && id !== "gcp") return;
    setStatuses(prev => ({ ...prev, [id]: { ...prev[id], testing: true, ok: undefined, message: undefined } }));
    try {
      const r = await fetch("/api/vault/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service: id, token }),
      }).then(r => r.json());
      setStatuses(prev => ({ ...prev, [id]: { configured: r.stored, testing: false, ok: r.ok, message: r.message } }));
      setInputs(prev => ({ ...prev, [id]: "" }));  // clear input after save
    } catch {
      setStatuses(prev => ({ ...prev, [id]: { ...prev[id], testing: false, ok: false, message: "Request failed" } }));
    }
  };

  const testOnly = async (id: ServiceId) => {
    setStatuses(prev => ({ ...prev, [id]: { ...prev[id], testing: true, ok: undefined, message: undefined } }));
    const r = await fetch(`/api/vault/test/${id}`, { method: "POST" }).then(r => r.json()).catch(() => ({ ok: false, message: "Request failed" }));
    setStatuses(prev => ({ ...prev, [id]: { ...prev[id], testing: false, ok: r.ok, message: r.message } }));
  };

  const remove = async (id: ServiceId) => {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    setStatuses(prev => ({ ...prev, [id]: { configured: false, testing: false } }));
  };

  const createRepo = async () => {
    const name = (githubRepo.trim() || "crane-shipped");
    setCreatingRepo(true); setRepoResult(null);
    const r = await fetch("/api/vault/github/create-repo", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(r => r.json()).catch(() => ({ ok: false, message: "Request failed" }));
    setRepoResult(r);
    setCreatingRepo(false);
  };

  if (!open) return null;

  return (
    <div className="vault-overlay">
      <div className="vault-header">
        <span className="vault-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 7 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          SECURE VAULT
        </span>
        <span className="vault-subtitle">Tokens stored in ~/.crane_vault.env (chmod 600) — never committed, never logged</span>
        <button className="vault-close" onClick={onClose}>×</button>
      </div>

      <div className="vault-body">
        <div className="vault-grid">
          {SERVICES.map(svc => {
            const st = statuses[svc.id];
            const val = inputs[svc.id];
            const isGcp = svc.id === "gcp";

            return (
              <div key={svc.id} className={`vault-card ${st.configured ? "configured" : ""}`}>
                <div className="vault-card-top">
                  <span className="vault-icon">{svc.icon}</span>
                  <span className="vault-service-name">{svc.label}</span>
                  <span className={`vault-dot ${st.configured ? (st.ok === false ? "bad" : "ok") : "off"}`} />
                  {st.configured && st.ok !== undefined && (
                    <span className={`vault-status-text ${st.ok ? "ok" : "bad"}`}>
                      {st.ok ? "✓" : "✗"}
                    </span>
                  )}
                </div>

                {st.message && (
                  <div className={`vault-msg ${st.ok ? "ok" : "bad"}`}>{st.message}</div>
                )}

                <div className="vault-hint">{svc.hint}</div>

                {isGcp ? (
                  <div className="vault-gcp-actions">
                    <button className="vault-btn test" disabled={st.testing} onClick={() => testOnly(svc.id)}>
                      {st.testing ? "Testing…" : "Test gcloud auth"}
                    </button>
                  </div>
                ) : (
                  <div className="vault-input-row">
                    <input
                      type="password"
                      className="vault-input"
                      placeholder={st.configured ? "••••••••  (already set)" : (svc.placeholder ?? "")}
                      value={val}
                      onChange={e => setInput(svc.id, e.target.value)}
                      onKeyDown={e => e.key === "Enter" && save(svc.id)}
                      autoComplete="off"
                    />
                    <button className="vault-btn save" disabled={!val.trim() || st.testing}
                      onClick={() => save(svc.id)}>
                      {st.testing ? "…" : "Save & Test"}
                    </button>
                    {st.configured && (
                      <button className="vault-btn test" disabled={st.testing} onClick={() => testOnly(svc.id)} title="Re-test">↺</button>
                    )}
                    {st.configured && (
                      <button className="vault-btn del" onClick={() => remove(svc.id)} title="Remove token">✕</button>
                    )}
                  </div>
                )}

                {/* GitHub extra: create repo */}
                {svc.id === "github" && st.configured && (
                  <div className="vault-github-extra">
                    <div className="vault-repo-row">
                      <input className="vault-input repo-name" placeholder="crane-shipped"
                        value={githubRepo} onChange={e => setGithubRepo(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && createRepo()} />
                      <button className="vault-btn save" disabled={creatingRepo} onClick={createRepo}>
                        {creatingRepo ? "Creating…" : "🚀 Push to GitHub"}
                      </button>
                    </div>
                    {repoResult && (
                      <div className={`vault-msg ${repoResult.ok ? "ok" : "bad"}`}>
                        {repoResult.message}
                        {repoResult.url && <a href={repoResult.url} target="_blank" rel="noreferrer" className="vault-link"> → {repoResult.url}</a>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
