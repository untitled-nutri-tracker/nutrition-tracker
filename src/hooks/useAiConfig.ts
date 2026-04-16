/**
 * useAiConfig — Frontend hook for AI configuration management.
 *
 * Wraps the Tauri IPC commands for reading/writing AI preferences
 * (provider, model, Ollama endpoint, verification status).
 *
 * This replaces the old localStorage-based provider selection with
 * a backend-persisted config file managed by the Rust layer.
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const USE_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AiConfig {
  selectedProvider: string;
  selectedModels: Record<string, string>;
  ollamaEndpoint: string;
  verifiedProviders: string[];
}

export interface AiModelInfo {
  id: string;
  name: string;
  provider: string;
}

const DEFAULT_CONFIG: AiConfig = {
  selectedProvider: "ollama",
  selectedModels: {},
  ollamaEndpoint: "http://localhost:11434",
  verifiedProviders: [],
};

export function useAiConfig() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);

  /** Load config from backend on mount. */
  const loadConfig = useCallback(async () => {
    if (!USE_TAURI) {
      setConfig(DEFAULT_CONFIG);
      setLoading(false);
      return DEFAULT_CONFIG;
    }
    try {
      const cfg = await invoke<AiConfig>("get_ai_config");
      setConfig(cfg);
      return cfg;
    } catch (e) {
      console.error("[useAiConfig] Failed to load:", e);
      setConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /** Persist a partial config update. Merges with current config. */
  async function saveConfig(patch: Partial<AiConfig>): Promise<void> {
    const current = config ?? DEFAULT_CONFIG;
    const merged: AiConfig = { ...current, ...patch };
    if (!USE_TAURI) {
      setConfig(merged);
      return;
    }
    await invoke("save_ai_config", { config: merged });
    setConfig(merged);
  }

  /** Select a provider and persist immediately. */
  async function selectProvider(providerId: string): Promise<void> {
    await saveConfig({ selectedProvider: providerId });
  }

  /** Select a model for a specific provider and persist immediately. */
  async function selectModel(
    providerId: string,
    modelId: string
  ): Promise<void> {
    const current = config ?? DEFAULT_CONFIG;
    const updatedModels = { ...current.selectedModels, [providerId]: modelId };
    await saveConfig({ selectedModels: updatedModels });
  }

  /** Update the Ollama endpoint and persist immediately. */
  async function setOllamaEndpoint(endpoint: string): Promise<void> {
    await saveConfig({ ollamaEndpoint: endpoint });
  }

  /** Fetch available models for a provider (no verification side-effect). */
  async function listModels(providerId: string): Promise<AiModelInfo[]> {
    if (!USE_TAURI) return [];
    return await invoke<AiModelInfo[]>("list_ai_models", {
      provider: providerId,
    });
  }

  /**
   * Verify connectivity for a provider.
   * On success, marks the provider as verified and returns the model list.
   * On failure, throws with a user-friendly error message.
   */
  async function verifyProvider(providerId: string): Promise<AiModelInfo[]> {
    if (!USE_TAURI) return [];
    const models = await invoke<AiModelInfo[]>("verify_ai_provider", {
      provider: providerId,
    });

    // Optimistically update local state so the badge flips immediately
    setConfig((prev) => {
      if (!prev) return prev;
      const verified = new Set(prev.verifiedProviders);
      verified.add(providerId);
      return { ...prev, verifiedProviders: Array.from(verified) };
    });

    return models;
  }

  /** Check if a provider is currently marked as verified. */
  function isVerified(providerId: string): boolean {
    return config?.verifiedProviders?.includes(providerId) ?? false;
  }

  /** Get the currently selected model for a provider. */
  function selectedModel(providerId: string): string | undefined {
    return config?.selectedModels?.[providerId];
  }

  return {
    config,
    loading,
    loadConfig,
    saveConfig,
    selectProvider,
    selectModel,
    setOllamaEndpoint,
    listModels,
    verifyProvider,
    isVerified,
    selectedModel,
  };
}
