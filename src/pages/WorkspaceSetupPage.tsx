import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import ProfileForm from "../components/ProfileForm";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import { saveProfile } from "../lib/profileStore";
import type { UserProfile } from "../types/profile";

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

      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }

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

      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }

      setExistingPath(selected);
      await openDatabase(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open database");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="setupShell">
      <section className="setupHero">
        <div className="setupEyebrow">NutriLog</div>
        <h1>Choose a database.</h1>
        <p>
          Create a new local SQLite database with your profile, or reconnect an
          existing `.db` file.
        </p>
      </section>

      {error && (
        <div className="setupError">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      )}

      {mode === "menu" ? (
        <div className="setupMenu">
          <button
            className="setupChoiceCard"
            type="button"
            onClick={() => {
              setError(null);
              setMode("create");
            }}
          >
            <span className="setupChoiceEyebrow">New Workspace</span>
            <strong>Create database</strong>
            <span>
              Start a new tracker database and initialize your profile.
            </span>
          </button>

          <button
            className="setupChoiceCard"
            type="button"
            onClick={handleBrowse}
            disabled={opening}
          >
            <span className="setupChoiceEyebrow">Existing Workspace</span>
            <strong>{opening ? "Opening..." : "Open database"}</strong>
            <span>
              Pick an existing NutriLog database and connect immediately.
            </span>
          </button>
        </div>
      ) : (
        <div className="card setupCard">
          <div className="setupCardHeader">
            <div>
              <div className="setupCardTitle">Initialize your profile</div>
              <div className="setupCardText">
                After you click save, you will choose where to save the new
                database file.
              </div>
            </div>
          </div>

          <ProfileForm
            initial={null}
            onSave={handleCreate}
            saving={creating}
            title="Initial profile"
            description="This profile is saved into the new database so the workspace is ready immediately."
            submitLabel="Save profile and choose location"
          />

          <button
            onClick={() => {
              setError(null);
              setMode("menu");
            }}
            className="setupSecondaryButton"
            type="button"
          >
            Back
          </button>
        </div>
      )}

      {mode === "menu" && session.lastPath && (
        <div className="card setupCard">
          <div className="setupCardHeader">
            <div className="setupCardTitle">Manual path fallback</div>
            <div className="setupCardText">
              If you prefer, paste a path and open it directly.
            </div>
          </div>

          <label className="setupLabel">
            <span>Database path</span>
            <input
              value={existingPath}
              onChange={(e) => setExistingPath(e.target.value)}
              placeholder="/Users/you/Documents/nutrition.db"
              className="setupInput"
            />
          </label>

          <div className="setupButtonRow">
            <button
              onClick={handleOpen}
              disabled={opening || !existingPath.trim()}
              className="setupSecondaryButton"
              type="button"
            >
              Open typed path
            </button>

            <button
              onClick={() => setExistingPath(session.lastPath ?? "")}
              className="setupSecondaryButton"
              type="button"
            >
              Use last path
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
