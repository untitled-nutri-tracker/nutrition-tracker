import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import ProfileForm from "../components/ProfileForm";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import { saveProfile } from "../lib/profileStore";
import type { UserProfile } from "../types/profile";
import { motion, AnimatePresence } from "framer-motion";

type LandingMode = "menu" | "create";

export default function WorkspaceSetupPage() {
  const { session, createDatabase, openDatabase } = useDatabaseSession();
  const [mode, setMode] = useState<LandingMode>("menu");
  const [existingPath, setExistingPath] = useState(session.lastPath ?? "");
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(profile: UserProfile) {
    setCreating(true);
    setError(null);
    try {
      const selected = await save({
        defaultPath: `${session.defaultDatabaseDirectory}/nutrition.db`,
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      await createDatabase(selected);
      await saveProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create database");
      throw err;
    } finally {
      setCreating(false);
    }
  }

  async function handleOpen() {
    setOpening(true);
    setError(null);
    try {
      await openDatabase(existingPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open database");
    } finally {
      setOpening(false);
    }
  }

  async function handleBrowse() {
    setOpening(true);
    setError(null);
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        defaultPath: session.lastPath ?? session.defaultDatabaseDirectory,
        filters: [
          { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setExistingPath(selected);
      await openDatabase(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open database");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[#0d0d12] text-white/90 overflow-hidden font-sans relative">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/[0.06] rounded-full blur-[120px] -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/[0.05] rounded-full blur-[100px] translate-y-1/2" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6 py-12 overflow-y-auto">
        {/* Logo + wordmark */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-center gap-3 mb-10"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_8px_24px_rgba(99,102,241,0.35)]" />
          <div>
            <div className="text-lg font-bold tracking-tight leading-none">NutriLog</div>
            <div className="text-xs text-white/35 tracking-wide mt-0.5">Local-first nutrition tracker</div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {mode === "menu" ? (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-md"
            >
              {/* Hero text */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                  Choose a workspace
                </h1>
                <p className="text-sm text-white/40 leading-relaxed">
                  Your data lives in a local SQLite database. Create a new one or open an existing file.
                </p>
              </div>

              {/* Error banner */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm"
                >
                  <span className="text-red-400 shrink-0">⚠</span>
                  <span className="text-red-300/90">{error}</span>
                </motion.div>
              )}

              {/* Choice cards */}
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => { setError(null); setMode("create"); }}
                  className="group w-full text-left px-5 py-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-indigo-500/40 hover:bg-indigo-500/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(99,102,241,0.12)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center text-xl shrink-0 group-hover:from-indigo-500/30 transition-all">
                      ✦
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-indigo-400/80 mb-0.5">New Workspace</div>
                      <div className="font-semibold text-sm text-white/95">Create database</div>
                      <div className="text-xs text-white/40 mt-0.5 leading-snug">Start fresh with your profile and a new local database file.</div>
                    </div>
                    <span className="shrink-0 text-white/20 group-hover:text-white/50 transition-colors ml-auto text-lg">›</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={opening}
                  className="group w-full text-left px-5 py-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-cyan-500/40 hover:bg-cyan-500/[0.05] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(6,182,212,0.10)] disabled:opacity-60 disabled:cursor-wait disabled:translate-y-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center text-xl shrink-0 group-hover:from-cyan-500/30 transition-all">
                      📂
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-400/80 mb-0.5">Existing Workspace</div>
                      <div className="font-semibold text-sm text-white/95">{opening ? "Opening…" : "Open database"}</div>
                      <div className="text-xs text-white/40 mt-0.5 leading-snug">Browse for an existing NutriLog `.db` file to reconnect.</div>
                    </div>
                    <span className="shrink-0 text-white/20 group-hover:text-white/50 transition-colors ml-auto text-lg">›</span>
                  </div>
                </button>
              </div>

              {/* Manual path fallback — shown only if a lastPath exists */}
              {session.lastPath && (
                <div className="mt-5 px-5 py-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">Recent database</div>
                  <div className="font-mono text-xs text-white/50 mb-3 truncate bg-black/20 px-3 py-2 rounded-lg border border-white/5">
                    {existingPath || session.lastPath}
                  </div>
                  <label className="block mb-2">
                    <span className="text-[11px] text-white/40 font-semibold uppercase tracking-wide">Path</span>
                    <input
                      value={existingPath}
                      onChange={(e) => setExistingPath(e.target.value)}
                      placeholder="/Users/you/Documents/nutrition.db"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/5 text-xs text-white/90 font-mono placeholder:text-white/25 focus:outline-none focus:border-indigo-500/40 transition-colors"
                    />
                  </label>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleOpen}
                      disabled={opening || !existingPath.trim()}
                      className="flex-1 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/5 text-xs font-semibold text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Open typed path
                    </button>
                    <button
                      onClick={() => setExistingPath(session.lastPath ?? "")}
                      className="px-3 py-2 rounded-lg border border-white/[0.08] bg-white/5 text-xs font-semibold text-white/50 hover:bg-white/10 transition-colors"
                    >
                      Use last
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-lg"
            >
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight mb-1">Initialize your profile</h1>
                <p className="text-sm text-white/40">After saving, you'll choose where to store the database file.</p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm"
                >
                  <span className="text-red-400 shrink-0">⚠</span>
                  <span className="text-red-300/90">{error}</span>
                </motion.div>
              )}

              <div className="px-5 py-5 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                <ProfileForm
                  initial={null}
                  onSave={handleCreate}
                  saving={creating}
                  title="Initial profile"
                  description="This profile is saved into the new database so the workspace is ready immediately."
                  submitLabel="Save profile and choose location"
                />
              </div>

              <button
                onClick={() => { setError(null); setMode("menu"); }}
                type="button"
                className="mt-4 w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-transparent text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
              >
                ← Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
