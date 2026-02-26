import { useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import {createProfile, Sex, UserProfile} from "./generated";

export const SEX_OPTIONS = [
    {value: "FEMALE", label: "Female"},
    {value: "MALE", label: "Male"},
] as const;

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
    const [height, setHeight] = useState("");
    const [weight, setWeight] = useState("");
    const [sex, setSex] = useState("FEMALE");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
      const profile: UserProfile = {
          id: 0,
          name: name,
          weight: parseFloat(weight),
          sex: sex as Sex,
          height: parseFloat(height),
      }
      setGreetMsg(await createProfile({userProfile: profile}));
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
          className="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
          <div className="form-row">
              <input
                  id="name-input"
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="Enter a name..."
              />
              <select
                  id="sex-input"
                  value={sex}
                  onChange={(e) => {
                      setSex(e.target.value);
                  }}
              >
                  {SEX_OPTIONS.map((sex) => (
                      <option key={sex.value} value={sex.value}>
                          {sex.label}
                      </option>
                  ))}
              </select>
          </div>
          <div className="form-row">
              <input
                  id="weight-input"
                  onChange={(e) => setWeight(e.currentTarget.value)}
                  placeholder="Weight... (number only)"
              />
              <input
                  id="height-input"
                  onChange={(e) => setHeight(e.currentTarget.value)}
                  placeholder="Height... (number only)"
              />
          </div>
          <div className="form-row">
              <button type="submit">Create Profile</button>
          </div>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
