import { useNetwork } from "../lib/NetworkContext";

/**
 * AI Advisor page — requires network access.
 *
 * Shows a contextual offline message if the user is offline.
 *
 * ## Pattern for future developers
 * When implementing the actual AI call:
 * 1. Use `useNetwork().isOnline` for UI hints (disable button, show message)
 * 2. In the Rust command, errors from failed API calls are already user-friendly
 *    via `map_network_error` — just propagate them normally
 */
export default function AiAdvisor() {
  const { isOnline } = useNetwork();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {!isOnline && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(255, 180, 0, 0.3)",
            background: "rgba(255, 180, 0, 0.06)",
          }}
        >
          <div style={{ fontWeight: 600 }}>You're offline</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>
            AI nutrition advice requires an internet connection. Connect to the
            network, then come back.
          </div>
        </div>
      )}

      <div className="card">
        <p style={{ color: "var(--muted)" }}>
          AI-based nutrition recommendations and meal suggestions will be
          implemented later.
        </p>
      </div>
    </div>
  );
}