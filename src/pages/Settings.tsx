import { useState, useEffect, useCallback } from "react";
import ProfileForm from "../components/ProfileForm";
import { useUserProfile } from "../hooks/useUserProfile";
import {
  useCredentials,
  LLM_PROVIDERS,
  EXTERNAL_DATA_PROVIDERS,
  type LlmProviderConfig,
  type ExternalDataProviderConfig,
} from "../hooks/useCredentials";
import "../styles/credentials.css";

export default function Settings() {
  const { profile, loading, saving, error, computed, persist, reset } =
    useUserProfile();

  if (loading) {
    return (
      <div className="card">
        <div style={{ color: "var(--muted)" }}>Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ display: "grid", gap: 14 }}>
      {error && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.08)",
          }}
        >
          <div style={{ fontWeight: 600 }}>Error</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>{error}</div>
        </div>
      )}

      <div className="pop-in">
        <ProfileForm initial={profile} onSave={persist} saving={saving} />
      </div>

      <div className="card pop-in-delay-1" style={{ maxWidth: 720 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Energy estimates</div>
        <div
          style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}
        >
          Based on Mifflin–St Jeor + activity multiplier.
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div style={metricBox}>
            <div style={metricLabel}>BMR</div>
            <div style={metricValue}>
              {computed ? `${computed.bmr} kcal/day` : "—"}
            </div>
          </div>
          <div style={metricBox}>
            <div style={metricLabel}>TDEE</div>
            <div style={metricValue}>
              {computed ? `${computed.tdee} kcal/day` : "—"}
            </div>
          </div>
        </div>

        {profile && (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={reset}
              disabled={saving}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--muted)",
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Reset profile
            </button>
          </div>
        )}
      </div>

      {/* ── AI Provider Configuration ── */}
      <ApiKeySection />
    </div>
  );
}

/* ================================================================== *
 *  API Key Management Section                                         *
 * ================================================================== */
function ApiKeySection() {
  type CredentialProvider = LlmProviderConfig | (ExternalDataProviderConfig & { requiresKey: true });
  const cred = useCredentials();
  const [providerStatus, setProviderStatus] = useState<
    Record<string, { hasKey: boolean; preview: string }>
  >({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState(() => {
    return localStorage.getItem("nutrilog_ai_provider") || "ollama";
  });
  const [selectedVisionProvider, setSelectedVisionProvider] = useState(() => {
    return localStorage.getItem("nutrilog_vision_provider") || "ollama";
  });
  const [photoCloudEnabled, setPhotoCloudEnabled] = useState(() => {
    return localStorage.getItem("nutrilog_photo_scan_cloud_enabled") === "true";
  });

  // Load provider status on mount
  const refreshStatus = useCallback(async () => {
    const status: Record<string, { hasKey: boolean; preview: string }> = {};
    for (const p of [...LLM_PROVIDERS, ...EXTERNAL_DATA_PROVIDERS]) {
      const hasKey = await cred.hasKey(p.service);
      const preview = hasKey ? await cred.getPreview(p.service) : "";
      status[p.id] = { hasKey, preview };
    }
    setProviderStatus(status);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSaveKey = async (provider: CredentialProvider) => {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    setSaveMsg(null);
    try {
      await cred.storeKey(provider.service, keyInput.trim());
      setKeyInput("");
      setEditingProvider(null);
      setSaveMsg(`✅ ${provider.name} key saved`);
      await refreshStatus();
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      setSaveMsg(`❌ ${e?.toString()}`);
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteKey = async (provider: CredentialProvider) => {
    try {
      await cred.deleteKey(provider.service);
      await refreshStatus();
      setSaveMsg(`🗑️ ${provider.name} key removed`);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      setSaveMsg(`❌ ${e?.toString()}`);
    }
  };

  const handleSelectProvider = (id: string) => {
    setSelectedProvider(id);
    localStorage.setItem("nutrilog_ai_provider", id);
  };

  const handleSelectVisionProvider = (id: string) => {
    setSelectedVisionProvider(id);
    localStorage.setItem("nutrilog_vision_provider", id);
  };

  const handlePhotoCloudToggle = (enabled: boolean) => {
    setPhotoCloudEnabled(enabled);
    localStorage.setItem("nutrilog_photo_scan_cloud_enabled", String(enabled));
    if (!enabled && selectedVisionProvider !== "ollama") {
      handleSelectVisionProvider("ollama");
    }
  };

  return (
    <div className="card pop-in-delay-2" style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        AI Provider Configuration
      </div>
      <div
        style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}
      >
        Select your preferred AI provider and manage API keys. Keys are
        stored securely in your OS keychain.
      </div>

      {/* Provider selector */}
      <div className="provider-select-row">
        {LLM_PROVIDERS.map((p) => (
          <button
            key={p.id}
            className={`provider-pill ${selectedProvider === p.id ? "selected" : ""}`}
            onClick={() => handleSelectProvider(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Status message */}
      {saveMsg && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
          }}
        >
          {saveMsg}
        </div>
      )}

      {/* Provider cards */}
      <div
        style={{ marginTop: 14, display: "grid", gap: 10 }}
      >
        {LLM_PROVIDERS.map((provider) => {
          const status = providerStatus[provider.id];
          const isSelected = selectedProvider === provider.id;
          const isEditing = editingProvider === provider.id;

          return (
            <div
              key={provider.id}
              className={`provider-card ${isSelected ? "active" : ""}`}
            >
              <div className="provider-card-header">
                <div>
                  <div className="provider-name">{provider.name}</div>
                  <div className="provider-desc">{provider.description}</div>
                </div>

                {/* Status badge */}
                {!provider.requiresKey ? (
                  <span className="key-status local">🟢 Local</span>
                ) : status?.hasKey ? (
                  <span className="key-status stored">✅ Key stored</span>
                ) : (
                  <span className="key-status missing">⚠️ No key</span>
                )}
              </div>

              {/* Key preview + actions (only for providers that need keys) */}
              {provider.requiresKey && status?.hasKey && !isEditing && (
                <div className="key-preview">
                  <span>{status.preview}</span>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    <button
                      className="key-delete-btn"
                      onClick={() => setEditingProvider(provider.id)}
                      style={{
                        borderColor: "rgba(124,92,255,0.3)",
                        background: "rgba(124,92,255,0.08)",
                      }}
                    >
                      Change
                    </button>
                    <button
                      className="key-delete-btn"
                      onClick={() => handleDeleteKey(provider)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Key input (for adding or changing) */}
              {provider.requiresKey &&
                (!status?.hasKey || isEditing) && (
                  <div className="key-input-row">
                    <input
                      className="key-input"
                      type="password"
                      placeholder={`Paste your ${provider.name} API key…`}
                      value={editingProvider === provider.id ? keyInput : ""}
                      onFocus={() => {
                        setEditingProvider(provider.id);
                        setKeyInput("");
                      }}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveKey(provider);
                      }}
                    />
                    <button
                      className="key-save-btn"
                      onClick={() => handleSaveKey(provider)}
                      disabled={savingKey || !keyInput.trim()}
                      style={{
                        opacity:
                          savingKey || !keyInput.trim() ? 0.6 : 1,
                      }}
                    >
                      {savingKey ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}

              {/* Ollama endpoint config */}
              {!provider.requiresKey && provider.id === "ollama" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--muted2)",
                  }}
                >
                  Default endpoint: http://localhost:11434
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Food photo scanning</div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted2)" }}>
          Photo scans default to local Ollama. Cloud vision only runs when explicitly enabled here.
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label className="privacy-consent" style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              type="checkbox"
              checked={photoCloudEnabled}
              onChange={(e) => handlePhotoCloudToggle(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span className="privacy-consent-title" style={{ display: "block" }}>
                Allow cloud vision for food photos
              </span>
              <span className="privacy-consent-text" style={{ display: "block" }}>
                When enabled and a cloud vision provider is selected, food photos may be sent to that provider. USDA receives only the predicted food name.
              </span>
            </span>
          </label>
          <div className="provider-select-row" style={{ marginTop: 0 }}>
            {LLM_PROVIDERS.map((p) => {
              const disabled = p.id !== "ollama" && !photoCloudEnabled;
              return (
                <button
                  key={p.id}
                  className={`provider-pill ${selectedVisionProvider === p.id ? "selected" : ""}`}
                  onClick={() => handleSelectVisionProvider(p.id)}
                  disabled={disabled}
                  style={{ opacity: disabled ? 0.45 : 1 }}
                  title={disabled ? "Enable cloud vision first" : p.description}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Nutrition data providers</div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted2)" }}>
          Photo scans use these keys to compute nutrition from identified foods. Food photos are not sent to nutrition data providers.
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {EXTERNAL_DATA_PROVIDERS.map((provider) => {
            const status = providerStatus[provider.id];
            const isEditing = editingProvider === provider.id;
            const credentialProvider = { ...provider, requiresKey: true };

            return (
              <div key={provider.id} className="provider-card">
                <div className="provider-card-header">
                  <div>
                    <div className="provider-name">{provider.name}</div>
                    <div className="provider-desc">{provider.description}</div>
                  </div>
                  {status?.hasKey ? (
                    <span className="key-status stored">✅ Key stored</span>
                  ) : (
                    <span className="key-status missing">⚠️ No key</span>
                  )}
                </div>

                {status?.hasKey && !isEditing && (
                  <div className="key-preview">
                    <span>{status.preview}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="key-delete-btn"
                        onClick={() => setEditingProvider(provider.id)}
                        style={{
                          borderColor: "rgba(124,92,255,0.3)",
                          background: "rgba(124,92,255,0.08)",
                        }}
                      >
                        Change
                      </button>
                      <button
                        className="key-delete-btn"
                        onClick={() => handleDeleteKey(credentialProvider)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {(!status?.hasKey || isEditing) && (
                  <div className="key-input-row">
                    <input
                      className="key-input"
                      type="password"
                      placeholder={`Paste your ${provider.name} API key…`}
                      value={editingProvider === provider.id ? keyInput : ""}
                      onFocus={() => {
                        setEditingProvider(provider.id);
                        setKeyInput("");
                      }}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveKey(credentialProvider);
                      }}
                    />
                    <button
                      className="key-save-btn"
                      onClick={() => handleSaveKey(credentialProvider)}
                      disabled={savingKey || !keyInput.trim()}
                      style={{ opacity: savingKey || !keyInput.trim() ? 0.6 : 1 }}
                    >
                      {savingKey ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Privacy notice for cloud providers */}
      {selectedProvider !== "ollama" && (
        <div className="privacy-consent">
          <div className="privacy-consent-title">⚠️ Privacy Notice</div>
          <div className="privacy-consent-text">
            When using cloud AI providers (OpenAI, Anthropic, Google),
            your meal data will be sent to their servers for analysis.
            No personal information beyond food logs is shared. Your
            API keys are stored locally in your OS keychain and never
            leave your device.
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
const metricBox: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,0.03)",
};

const metricLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted2)",
};

const metricValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 700,
};
