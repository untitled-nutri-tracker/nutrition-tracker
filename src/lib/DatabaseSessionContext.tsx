import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {closeDatabase, createDatabase, DatabaseSessionInfo, getDatabaseSession, openDatabase} from "../generated";

interface DatabaseSessionContextValue {
  session: DatabaseSessionInfo;
  loading: boolean;
  refresh: () => Promise<DatabaseSessionInfo>;
  createDb: (path: string) => Promise<string>;
  openDb: (path: string) => Promise<string>;
  closeDb: () => Promise<void>;
}

const EMPTY_SESSION: DatabaseSessionInfo = {
  connectedPath: null,
  lastPath: null,
  defaultDatabaseDirectory: "",
};

const DatabaseSessionContext = createContext<DatabaseSessionContextValue | null>(null);

export function DatabaseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DatabaseSessionInfo>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<DatabaseSessionInfo> {
    const next = await getDatabaseSession();
    setSession(next);
    return next;
  }

  async function createDb(path: string): Promise<string> {
    const connectedPath = await createDatabase({path});
    await refresh();
    return connectedPath;
  }

  async function openDb(path: string): Promise<string> {
    const connectedPath = await openDatabase({path});
    await refresh();
    return connectedPath;
  }

  async function closeDb(): Promise<void> {
    await closeDatabase();
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
    createDb,
    openDb,
    closeDb
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
