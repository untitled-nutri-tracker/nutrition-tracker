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
  customEndpoint: string;
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
  customEndpoint: "https://openrouter.ai/api/v1",
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

  /** Persist a partial config update. Merges with current config from backend. */
  async function saveConfig(patch: Partial<AiConfig>): Promise<void> {
    // Always fetch latest truth from backend to avoid state race conditions
    const current = await loadConfig();
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
    // 1. Fetch latest truth from backend
    const current = await loadConfig();
    // 2. Perform merge on the fresh data
    const updatedModels = { ...current.selectedModels, [providerId]: modelId };
    const merged = { ...current, selectedModels: updatedModels };
    // 3. Persist and update state
    if (USE_TAURI) {
      await invoke("save_ai_config", { config: merged });
    }
    setConfig(merged);
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

  /** Update custom remote endpoint in the backend and reload config locally. */
  async function setCustomEndpoint(endpoint: string) {
    if (!USE_TAURI) return;
    await invoke("set_custom_endpoint", { endpoint });
    await loadConfig();
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

    // Reload full config from backend to pick up the new 'verifiedProviders' update
    await loadConfig();

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
    setCustomEndpoint,
    listModels,
    verifyProvider,
    isVerified,
    selectedModel,
  };
}
