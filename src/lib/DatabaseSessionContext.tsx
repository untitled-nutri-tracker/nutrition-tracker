import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DatabaseSession {
  connectedPath: string | null;
  lastPath: string | null;
  defaultDatabaseDirectory: string;
}

interface DatabaseSessionContextValue {
  session: DatabaseSession;
  loading: boolean;
  refresh: () => Promise<DatabaseSession>;
  createDatabase: (path: string) => Promise<string>;
  openDatabase: (path: string) => Promise<string>;
  closeDatabase: () => Promise<void>;
}

const EMPTY_SESSION: DatabaseSession = {
  connectedPath: null,
  lastPath: null,
  defaultDatabaseDirectory: "",
};

const DatabaseSessionContext = createContext<DatabaseSessionContextValue | null>(null);

export function DatabaseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DatabaseSession>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<DatabaseSession> {
    const next = await invoke<DatabaseSession>("get_database_session");
    setSession(next);
    return next;
  }

  async function createDatabase(path: string): Promise<string> {
    const connectedPath = await invoke<string>("create_database", { path });
    await refresh();
    return connectedPath;
  }

  async function openDatabase(path: string): Promise<string> {
    const connectedPath = await invoke<string>("open_database", { path });
    await refresh();
    return connectedPath;
  }

  async function closeDatabase(): Promise<void> {
    await invoke("close_database");
    await refresh();
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value: DatabaseSessionContextValue = {
    session,
    loading,
    refresh,
    createDatabase,
    openDatabase,
    closeDatabase,
  };

  return (
    <DatabaseSessionContext.Provider value={value}>
      {children}
    </DatabaseSessionContext.Provider>
  );
}

export function useDatabaseSession() {
  const context = useContext(DatabaseSessionContext);
  if (!context) {
    throw new Error("useDatabaseSession must be used inside DatabaseSessionProvider");
  }
  return context;
}
