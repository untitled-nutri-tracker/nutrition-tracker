import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import ProfileForm from "../components/ProfileForm";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import { saveProfile } from "../lib/profileStore";
import type { UserProfile } from "../types/profile";

type LandingMode = "menu" | "create";

export default function LandingPage() {
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
    <div className="landingShell">
      <section className="landingHero">
        <div className="landingEyebrow">NutriLog</div>
        <h1>Choose a database.</h1>
        <p>
          Create a new local SQLite database with your profile, or reconnect an
          existing `.db` file.
        </p>
      </section>

      {error && (
        <div className="landingError">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      )}

      {mode === "menu" ? (
        <div className="landingMenu">
          <button
            className="landingChoiceCard"
            type="button"
            onClick={() => {
              setError(null);
              setMode("create");
            }}
          >
            <span className="landingChoiceEyebrow">New Workspace</span>
            <strong>Create database</strong>
            <span>
              Start a new tracker database and initialize your profile.
            </span>
          </button>

          <button
            className="landingChoiceCard"
            type="button"
            onClick={handleBrowse}
            disabled={opening}
          >
            <span className="landingChoiceEyebrow">Existing Workspace</span>
            <strong>{opening ? "Opening..." : "Open database"}</strong>
            <span>
              Pick an existing NutriLog SQLite file and connect immediately.
            </span>
          </button>
        </div>
      ) : (
        <div className="card landingCard">
          <div className="landingCardHeader">
            <div>
              <div className="landingCardTitle">Initialize your profile</div>
              <div className="landingCardText">
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
            className="landingSecondaryButton"
            type="button"
          >
            Back
          </button>
        </div>
      )}

      {mode === "menu" && session.lastPath && (
        <div className="card landingCard">
          <div className="landingCardHeader">
            <div className="landingCardTitle">Manual path fallback</div>
            <div className="landingCardText">
              If you prefer, paste a path and open it directly.
            </div>
          </div>

          <label className="landingLabel">
            <span>Database path</span>
            <input
              value={existingPath}
              onChange={(e) => setExistingPath(e.target.value)}
              placeholder="/Users/you/Documents/nutrition.db"
              className="landingInput"
            />
          </label>

          <div className="landingButtonRow">
            <button
              onClick={handleOpen}
              disabled={opening || !existingPath.trim()}
              className="landingSecondaryButton"
              type="button"
            >
              Open typed path
            </button>

            <button
              onClick={() => setExistingPath(session.lastPath ?? "")}
              className="landingSecondaryButton"
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
