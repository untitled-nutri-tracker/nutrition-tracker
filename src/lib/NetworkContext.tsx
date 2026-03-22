import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface NetworkContextValue {
  /** Whether the browser believes the device has internet access. */
  isOnline: boolean;
  /** Re-read navigator.onLine (e.g., for a Retry button). */
  checkNow: () => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * Provides real-time network status to the app via browser events.
 *
 * Wrap the root of the app with this provider (already done in App.tsx).
 * Uses `navigator.onLine` and the browser `online`/`offline` events — no
 * Tauri IPC round-trip needed for UI hints.
 *
 * @example
 * ```tsx
 * const { isOnline } = useNetwork();
 * if (!isOnline) { ... show offline message ... }
 * ```
 */
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const checkNow = useCallback(() => {
    setIsOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => setIsOnline(navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, checkNow }}>
      {children}
    </NetworkContext.Provider>
  );
}

/**
 * Access the current network status from any component.
 * Must be used inside a `<NetworkProvider>`.
 */
export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used inside <NetworkProvider>");
  }
  return ctx;
}
