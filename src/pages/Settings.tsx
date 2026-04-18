import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ProfileForm from "../components/ProfileForm";
import { useUserProfile } from "../hooks/useUserProfile";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import {
  useCredentials,
  LLM_PROVIDERS,
  EXTERNAL_DATA_PROVIDERS,
  type LlmProviderConfig,
  type ExternalDataProviderConfig,
} from "../hooks/useCredentials";
import { useAiConfig, type AiModelInfo } from "../hooks/useAiConfig";
import { getMemories, deleteMemory } from "../generated/commands";
import type { AiMemory } from "../generated/types";
import "../styles/credentials.css";

export default function Settings() {
  const { session } = useDatabaseSession();
  const { profile, loading, saving, error, computed, persist, reset } =
    useUserProfile();
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  async function handleExportXlsx() {
    setExportMessage(null);

    const connectedPath = session.connectedPath?.trim();
    if (!connectedPath) {
      setExportMessage("No database is currently connected.");
      return;
    }

    const defaultPath = connectedPath.replace(/\.[^/.]+$/, "") || connectedPath;
    const selectedPath = await save({
      defaultPath: `${defaultPath}.xlsx`,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });

    if (typeof selectedPath !== "string" || !selectedPath.trim()) {
      return;
    }

    setExporting(true);
    try {
      const writtenPath = await invoke<string>("export_xlsx_to_path", {
        path: selectedPath,
      });
      setExportMessage(`Exported database to ${writtenPath}`);
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : "Failed to export database",
      );
    } finally {
      setExporting(false);
    }
  }

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

      <div className="card pop-in-delay-1" style={{ maxWidth: 720 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Database export</div>
        <div
          style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}
        >
          Export the currently connected database as an Excel workbook.
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {session.connectedPath ?? "No database connected"}
          </div>

          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={exporting || !session.connectedPath}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--text)",
              cursor:
                exporting || !session.connectedPath ? "not-allowed" : "pointer",
              opacity: exporting || !session.connectedPath ? 0.6 : 1,
            }}
          >
            {exporting ? "Exporting..." : "Export as XLSX"}
          </button>
        </div>

        {exportMessage && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: exportMessage.startsWith("Exported")
                ? "var(--muted)"
                : "#ff9a9a",
            }}
          >
            {exportMessage}
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
  const aiCfg = useAiConfig();
  const [providerStatus, setProviderStatus] = useState<
    Record<string, { hasKey: boolean; preview: string }>
  >({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [selectedVisionProvider, setSelectedVisionProvider] = useState(() => {
    return localStorage.getItem("nutrilog_vision_provider") || "ollama";
  });
  const [photoCloudEnabled, setPhotoCloudEnabled] = useState(() => {
    return localStorage.getItem("nutrilog_photo_scan_cloud_enabled") === "true";
  });

  // AI Memory Management
  const [memories, setMemories] = useState<AiMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  useEffect(() => {
    async function fetchMemories() {
      setLoadingMemories(true);
      try {
        const result = await getMemories();
        setMemories(result || []);
      } catch (err) {
        console.error("Failed to fetch AI memories:", err);
      } finally {
        setLoadingMemories(false);
      }
    }
    fetchMemories();
  }, []);

  const handleRemoveMemory = async (id: number) => {
    try {
      await deleteMemory({ id });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  // Model listing state
  const [providerModels, setProviderModels] = useState<
    Record<string, AiModelInfo[]>
  >({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<Record<string, string>>({});

  // Ollama endpoint editing
  const [ollamaInput, setOllamaInput] = useState("");
  const [customEndpointInput, setCustomEndpointInput] = useState("");

  const selectedProvider = aiCfg.config?.selectedProvider ?? "ollama";

  // One-time localStorage migration
  useEffect(() => {
    if (!aiCfg.config) return;
    const legacy = localStorage.getItem("nutrilog_ai_provider");
    if (legacy) {
      aiCfg.selectProvider(legacy);
      localStorage.removeItem("nutrilog_ai_provider");
    }
  }, [aiCfg.config]);

  // Sync Ollama endpoint input when config loads
  useEffect(() => {
    if (aiCfg.config) {
      setOllamaInput(aiCfg.config.ollamaEndpoint || "http://localhost:11434");
      setCustomEndpointInput(aiCfg.config.customEndpoint || "https://openrouter.ai/api/v1");
    }
  }, [aiCfg.config]);

  // Load provider key status on mount
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

  // Pre-load models for verified providers
  useEffect(() => {
    if (!aiCfg.config) return;
    for (const pid of aiCfg.config.verifiedProviders) {
      if (!providerModels[pid]) {
        aiCfg.listModels(pid).then((models) => {
          setProviderModels((prev) => ({ ...prev, [pid]: models }));
          if (models.length > 0 && !aiCfg.selectedModel(pid)) {
            aiCfg.selectModel(pid, models[0].id).catch(() => {});
          }
        }).catch(() => {});
      }
    }
    // Also always load Anthropic's hardcoded list
    if (!providerModels["anthropic"]) {
      aiCfg.listModels("anthropic").then((models) => {
        setProviderModels((prev) => ({ ...prev, anthropic: models }));
        if (models.length > 0 && !aiCfg.selectedModel("anthropic")) {
          aiCfg.selectModel("anthropic", models[0].id).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [aiCfg.config]);

  const handleSaveKey = async (provider: CredentialProvider) => {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    setSaveMsg(null);
    try {
      await cred.storeKey(provider.service, keyInput.trim());
      setKeyInput("");
      setEditingProvider(null);
      setSaveMsg(`✅ ${provider.name} key saved — click "Test Connection" to verify.`);
      // Clear cached models since verification was invalidated
      setProviderModels((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      setVerifyError((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      await refreshStatus();
      // Reload config to get updated verifiedProviders
      await aiCfg.loadConfig();
      setTimeout(() => setSaveMsg(null), 4000);
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
      setProviderModels((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      await aiCfg.loadConfig();
      setSaveMsg(`🗑️ ${provider.name} key removed`);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      setSaveMsg(`❌ ${e?.toString()}`);
    }
  };

  const handleSelectProvider = async (id: string) => {
    await aiCfg.selectProvider(id);
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

  const handleVerify = async (providerId: string) => {
    setVerifying(providerId);
    setVerifyError((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    try {
      const models = await aiCfg.verifyProvider(providerId);
      setProviderModels((prev) => ({ ...prev, [providerId]: models }));
      if (models.length > 0 && !aiCfg.selectedModel(providerId)) {
        await aiCfg.selectModel(providerId, models[0].id);
      }
      const pName = LLM_PROVIDERS.find(p => p.id === providerId)?.name ?? providerId;
      setSaveMsg(`✅ ${pName} connection verified!`);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      const errStr = e?.toString() ?? "Connection failed";
      setVerifyError((prev) => ({ ...prev, [providerId]: errStr }));
    } finally {
      setVerifying(null);
    }
  };

  const handleModelSelect = async (providerId: string, modelId: string) => {
    await aiCfg.selectModel(providerId, modelId);
  };

  const handleOllamaEndpointSave = async () => {
    let trimmed = ollamaInput.trim();
    if (!trimmed) return;
    try {
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        trimmed = "http://" + trimmed;
      }
      new URL(trimmed); // Validate
      await aiCfg.setOllamaEndpoint(trimmed);
      setOllamaInput(trimmed); // sync corrected value
      setSaveMsg("✅ Ollama endpoint updated");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("❌ Invalid URL. Please provide a valid endpoint like http://localhost:11434");
    }
  };

  const handleCustomEndpointSave = async () => {
    let trimmed = customEndpointInput.trim();
    if (!trimmed) return;
    try {
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        trimmed = "https://" + trimmed;
      }
      new URL(trimmed); // Validate
      await aiCfg.setCustomEndpoint(trimmed);
      setCustomEndpointInput(trimmed); // sync corrected value
      setSaveMsg("✅ Custom endpoint updated");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("❌ Invalid URL. Please provide a valid endpoint like https://openrouter.ai/api/v1");
    }
  };

  if (aiCfg.loading) return null;

  return (
    <div className="card pop-in-delay-2" style={{ maxWidth: 720 }}>
      <div className="ai-config-header">
        AI Provider Configuration
      </div>
      <div className="ai-config-subtitle">
        Select your preferred AI provider and manage API keys. Keys are
        stored securely in your OS keychain.
      </div>

      {/* Provider selector pills */}
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

      {/* Status message banner */}
      {saveMsg && (
        <div className="provider-status-msg">
          {saveMsg}
        </div>
      )}

      {/* Provider cards */}
      <div className="provider-cards-grid">
        {LLM_PROVIDERS.map((provider) => {
          const status = providerStatus[provider.id];
          const isSelected = selectedProvider === provider.id;
          const isEditing = editingProvider === provider.id;
          const verified = aiCfg.isVerified(provider.id);
          const models = providerModels[provider.id] ?? [];
          const currentModel = aiCfg.selectedModel(provider.id);
          const isVerifyingThis = verifying === provider.id;
          const vError = verifyError[provider.id];

          return (
            <div
              key={provider.id}
              className={`provider-card ${isSelected ? "active" : ""}`}
            >
              {/* Header: name + status badge */}
              <div className="provider-card-header">
                <div>
                  <div className="provider-name">{provider.name}</div>
                  <div className="provider-desc">{provider.description}</div>
                </div>

                {/* Status badge */}
                {!provider.requiresKey ? (
                  verified ? (
                    <span className="key-status stored">✅ Verified</span>
                  ) : (
                    <span className="key-status local">🟢 Local</span>
                  )
                ) : !status?.hasKey ? (
                  <span className="key-status missing">⚠️ No key</span>
                ) : verified ? (
                  <span className="key-status stored">✅ Verified</span>
                ) : (
                  <span className="key-status unverified">🔑 Key saved · Not verified</span>
                )}
              </div>

              {/* Key preview + change/remove actions */}
              {provider.requiresKey && status?.hasKey && !isEditing && (
                <div className="key-preview">
                  <span>{status.preview}</span>
                  <div className="key-preview-actions">
                    <button
                      className="key-change-btn"
                      onClick={() => setEditingProvider(provider.id)}
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
                <div className="endpoint-section">
                  <div className="endpoint-label">
                    Endpoint URL
                  </div>
                  <div className="endpoint-input-row">
                    <input
                      className="endpoint-input"
                      type="text"
                      value={ollamaInput}
                      onChange={(e) => setOllamaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleOllamaEndpointSave();
                      }}
                      onBlur={handleOllamaEndpointSave}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                </div>
              )}

              {/* Custom OpenAI-compatible endpoint config */}
              {provider.requiresKey && provider.id === "custom" && (
                <div className="endpoint-section">
                  <div className="endpoint-label">
                    Endpoint URL
                  </div>
                  <div className="endpoint-input-row">
                    <input
                      className="endpoint-input"
                      type="text"
                      value={customEndpointInput}
                      onChange={(e) => setCustomEndpointInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCustomEndpointSave();
                      }}
                      onBlur={handleCustomEndpointSave}
                      placeholder="https://openrouter.ai/api/v1"
                    />
                  </div>
                </div>
              )}

              {/* Test Connection button */}
              {(provider.requiresKey ? status?.hasKey : true) && (
                <div className="verify-row">
                  <button
                    className="verify-btn"
                    onClick={() => handleVerify(provider.id)}
                    disabled={isVerifyingThis}
                  >
                    {isVerifyingThis ? "Verifying…" : "Test Connection"}
                  </button>
                  {vError && (
                    <span className="verify-error">
                      ❌ {vError.length > 80 ? vError.slice(0, 80) + "…" : vError}
                    </span>
                  )}
                </div>
              )}

              {/* Model selector (visible after verification) */}
              {models.length > 0 && (
                <div className="model-section">
                  <div className="model-label">
                    Model
                  </div>
                  <select
                    className="model-select"
                    value={currentModel ?? models[0]?.id ?? ""}
                    onChange={(e) => handleModelSelect(provider.id, e.target.value)}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Context & Memory */}
      <div className="card pop-in-delay-3" style={{ maxWidth: 720, marginTop: 14 }}>
        <div className="ai-config-header" style={{ marginBottom: 4 }}>
          AI Context & Memory
        </div>
        <div className="ai-config-subtitle" style={{ marginBottom: 16 }}>
          The AI automatically learns preferences and facts about you from your conversations to personalize advice. You can review and delete them here.
        </div>
        
        {loadingMemories ? (
          <div style={{ color: "var(--muted2)", fontSize: 13 }}>Loading your AI memories...</div>
        ) : memories.length === 0 ? (
          <div style={{ color: "var(--muted2)", fontSize: 13, fontStyle: "italic", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            No saved memories yet. As you chat, useful preferences can appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {memories.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <span style={{ fontSize: 14, color: "var(--text)" }}>{m.fact}</span>
                <button 
                  onClick={() => handleRemoveMemory(m.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted2)", padding: 4 }}
                  title="Delete memory"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
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
            When using cloud AI providers (OpenAI, Anthropic, Google, Custom),
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
