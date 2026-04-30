/**
 * useCredentials — Frontend hook for secure credential management.
 *
 * Wraps the Tauri IPC commands for credential operations.
 * The frontend can store keys and check status, but NEVER retrieve
 * the plaintext key — only masked previews.
 */
import {
  deleteCredential,
  getCredentialPreview,
  hasCredential,
  listCredentials as listCredentialsCommand,
  storeCredential,
} from "../bindings";

const USE_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface CredentialInfo {
  service: string;
  hasKey: boolean;
  preview: string;
}

export interface LlmProviderConfig {
  id: string;
  name: string;
  service: string;       // credential service key
  requiresKey: boolean;
  description: string;
}

export interface ExternalDataProviderConfig {
  id: string;
  name: string;
  service: string;
  description: string;
}

/** All supported LLM providers. */
export const LLM_PROVIDERS: LlmProviderConfig[] = [
  {
    id: "ollama",
    name: "Ollama (Local)",
    service: "llm.ollama.endpoint",
    requiresKey: false,
    description: "Runs on your machine. No API key needed — just install Ollama.",
  },
  {
    id: "openai",
    name: "OpenAI",
    service: "llm.openai",
    requiresKey: true,
    description: "GPT-4o-mini. Requires an API key from platform.openai.com.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    service: "llm.anthropic",
    requiresKey: true,
    description: "Claude 3.5 Haiku. Requires an API key from console.anthropic.com.",
  },
  {
    id: "google",
    name: "Google Gemini",
    service: "llm.google",
    requiresKey: true,
    description: "Gemini 2.0 Flash. Requires an API key from aistudio.google.com.",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    service: "llm.custom.key",
    requiresKey: true,
    description: "Connect to OpenRouter, Groq, DeepSeek, Together AI, or any remote OpenAI standard.",
  },
];

export const EXTERNAL_DATA_PROVIDERS: ExternalDataProviderConfig[] = [
  {
    id: "usda_fdc",
    name: "USDA FoodData Central",
    service: "nutrition.usda.fdc",
    description: "Used to compute calories and macros after local food-photo identification.",
  },
];

export function useCredentials() {
  /** Store an API key for a given service. */
  async function storeKey(service: string, key: string): Promise<void> {
    if (!USE_TAURI) {
      console.warn("[useCredentials] Not in Tauri — skipping store");
      return;
    }
    await storeCredential({ service, key });
  }

  /** Delete a stored credential. */
  async function deleteKey(service: string): Promise<void> {
    if (!USE_TAURI) return;
    await deleteCredential({ service });
  }

  /** Check if a credential exists. */
  async function hasKey(service: string): Promise<boolean> {
    if (!USE_TAURI) return false;
    return await hasCredential({ service });
  }

  /** Get a masked preview of a stored key (e.g. "sk-abc…xyz"). */
  async function getPreview(service: string): Promise<string> {
    if (!USE_TAURI) return "";
    return await getCredentialPreview({ service });
  }

  /** List all stored credentials with masked previews. */
  async function listCredentials(): Promise<CredentialInfo[]> {
    if (!USE_TAURI) return [];
    return await listCredentialsCommand();
  }

  return { storeKey, deleteKey, hasKey, getPreview, listCredentials };
}
