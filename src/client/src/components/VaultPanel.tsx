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
import { useCallback, useEffect, useState } from "react";

const SERVICES = [
  { id: "huggingface", label: "Hugging Face",           icon: "🤗", placeholder: "hf_…",          hint: "Profile → Access Tokens → New token (write) · Pro perks: ZeroGPU + unlimited inference" },
  { id: "github",      label: "GitHub",                  icon: "🐙", placeholder: "ghp_… or github_pat_…", hint: "Settings → Developer settings → PAT (classic)" },
  { id: "nvidia_ngc",  label: "NVIDIA NGC",              icon: "⚡", placeholder: "NGC API key",   hint: "ngc.nvidia.com → Setup → Get API Key · used as LLM fallback when GPU is paused" },
  { id: "nvidia_ent",  label: "NVIDIA Enterprise",       icon: "🖥", placeholder: "Enterprise key", hint: "NVIDIA Enterprise portal → API keys · unlocks full NIM catalog" },
  { id: "gcp",         label: "Google Cloud (gcloud)",   icon: "☁️", placeholder: null,             hint: "$240 credits expire 2026-11-01 — run: gcloud auth login  in the GCP terminal tab" },
  { id: "jev",         label: "JEV",                     icon: "🔑", placeholder: "••••••••",       hint: "Space secret — handled by the deployment pipeline" },
  { id: "gemini",      label: "Gemini",                  icon: "♊", placeholder: "AIza…",           hint: "aistudio.google.com → Get API key" },
  { id: "openai",      label: "OpenAI",                  icon: "🤖", placeholder: "sk-…",            hint: "platform.openai.com → API keys" },
  { id: "cfb",         label: "College Football API",    icon: "🏈", placeholder: "CFB bearer token", hint: "collegefootballdata.com → Account → API key" },
  { id: "tank",        label: "Tank API",                icon: "🎯", placeholder: "RapidAPI key",   hint: "rapidapi.com → Tank01 → Subscribe → App keys" },
  { id: "hostinger",  label: "Hostinger",               icon: "📧", placeholder: "Hostinger API token", hint: "hpanel.hostinger.com → Account → API tokens — for email management agent" },
] as const;

type ServiceId = typeof SERVICES[number]["id"];
type ServiceStatus = { configured: boolean; testing: boolean; ok?: boolean; message?: string };

export default function VaultPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"tokens" | "usage">("tokens");
  const [usageSummary, setUsageSummary] = useState<Record<string, {
    last_used: string | null; last_caller: string; last_device: string; last_model: string;
    total_calls: number; total_tokens: number; total_cost_usd: number;
  }>>({});
  const [recentUsage, setRecentUsage] = useState<Array<{
    ts: string; service: string; caller: string; device: string; tokens: number; model: string; note: string;
  }>>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    const data = await fetch("/api/vault/usage").then(r => r.json()).catch(() => ({ summary: {}, recent: [] }));
    setUsageSummary(data.summary ?? {});
    setRecentUsage(data.recent ?? []);
    setUsageLoading(false);
  }, []);

  useEffect(() => { if (open && tab === "usage") loadUsage(); }, [open, tab, loadUsage]);

  const [statuses, setStatuses] = useState<Record<ServiceId, ServiceStatus>>(() =>
    Object.fromEntries(SERVICES.map(s => [s.id, { configured: false, testing: false }])) as Record<ServiceId, ServiceStatus>
  );
  const [inputs, setInputs] = useState<Record<ServiceId, string>>(
    () => Object.fromEntries(SERVICES.map(s => [s.id, ""])) as Record<ServiceId, string>
  );
  const [githubRepo, setGithubRepo] = useState("");
  const [repoResult, setRepoResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [hfSpaceName, setHfSpaceName] = useState("");
  const [hfSpaceResult, setHfSpaceResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deployingSpace, setDeployingSpace] = useState(false);

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

      {/* tab bar */}
      <div className="vault-tabs">
        <button className={`vault-tab ${tab === "tokens" ? "on" : ""}`} onClick={() => setTab("tokens")}>TOKENS</button>
        <button className={`vault-tab ${tab === "usage" ? "on" : ""}`} onClick={() => { setTab("usage"); loadUsage(); }}>USAGE REPORT</button>
      </div>

      <div className="vault-body">
        {tab === "usage" ? (
          <div className="vault-usage">
            <div className="vu-toolbar">
              <span className="vu-title">API Usage — tracked by CRANE on this device</span>
              <button className="vault-btn test" disabled={usageLoading} onClick={loadUsage}>{usageLoading ? "Refreshing…" : "↺ Refresh"}</button>
            </div>
            {Object.keys(usageSummary).length === 0 && !usageLoading && (
              <div className="vu-empty">No usage recorded yet — usage is logged when CRANE calls an API on your behalf.</div>
            )}
            {Object.keys(usageSummary).length > 0 && (
              <table className="vu-table">
                <thead><tr>
                  <th>Service</th><th>Last Used</th><th>Program</th><th>Device</th><th>Calls</th><th>Tokens</th><th>Model</th>
                </tr></thead>
                <tbody>
                  {Object.entries(usageSummary).map(([svc, s]) => {
                    const label = SERVICES.find(x => x.id === svc)?.label ?? svc;
                    const lastUTC = s.last_used ? new Date(s.last_used) : null;
                    const lastStr = lastUTC ? lastUTC.toLocaleString() : "—";
                    return (
                      <tr key={svc}>
                        <td><span className="vu-svc">{label}</span></td>
                        <td className="vu-mono">{lastStr}</td>
                        <td><span className="vu-caller">{s.last_caller || "—"}</span></td>
                        <td className="vu-mono">{s.last_device || "—"}</td>
                        <td className="vu-num">{s.total_calls}</td>
                        <td className="vu-num">{s.total_tokens > 0 ? s.total_tokens.toLocaleString() : "—"}</td>
                        <td className="vu-mono vu-model">{s.last_model ? s.last_model.split("/").pop() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {recentUsage.length > 0 && (
              <>
                <div className="vu-section-title">Recent Activity (last 50)</div>
                <table className="vu-table vu-recent">
                  <thead><tr>
                    <th>Time</th><th>Service</th><th>Program</th><th>Device</th><th>Tokens</th><th>Model</th>
                  </tr></thead>
                  <tbody>
                    {[...recentUsage].reverse().map((e, i) => {
                      const label = SERVICES.find(x => x.id === e.service)?.label ?? e.service;
                      return (
                        <tr key={i}>
                          <td className="vu-mono">{new Date(e.ts).toLocaleString()}</td>
                          <td><span className="vu-svc">{label}</span></td>
                          <td><span className="vu-caller">{e.caller}</span></td>
                          <td className="vu-mono">{e.device}</td>
                          <td className="vu-num">{e.tokens > 0 ? e.tokens.toLocaleString() : "—"}</td>
                          <td className="vu-mono vu-model">{e.model ? e.model.split("/").pop() : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ) : (
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

                {/* HF extra: deploy ZeroGPU Space */}
                {svc.id === "huggingface" && st.configured && (
                  <div className="vault-github-extra">
                    <label>DEPLOY ZEROGPU SPACE (crane-gen) — free MiniMax H3 fallback</label>
                    <div className="vault-repo-row">
                      <input className="vault-input repo-name" placeholder="your-hf-username/crane-gen"
                        value={hfSpaceName} onChange={e => setHfSpaceName(e.target.value)} />
                      <button className="vault-btn save" disabled={deployingSpace || !hfSpaceName.trim()}
                        onClick={async () => {
                          setDeployingSpace(true); setHfSpaceResult(null);
                          const r = await fetch("/api/vault/hf/deploy-space", {
                            method: "POST", headers: { "content-type": "application/json" },
                            body: JSON.stringify({ repo_id: hfSpaceName.trim() }),
                          }).then(r => r.json()).catch(() => ({ ok: false, message: "Request failed" }));
                          setHfSpaceResult(r); setDeployingSpace(false);
                        }}>
                        {deployingSpace ? "Deploying…" : "🚀 Deploy Space"}
                      </button>
                    </div>
                    {hfSpaceResult && (
                      <div className={`vault-msg ${hfSpaceResult.ok ? "ok" : "bad"}`}>
                        {hfSpaceResult.message}
                      </div>
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
        )}
      </div>
    </div>
  );
}
