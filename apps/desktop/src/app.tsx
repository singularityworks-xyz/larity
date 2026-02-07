import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vite.dev" rel="noopener" target="_blank">
          <img
            alt="Vite logo"
            className="logo vite"
            height="32"
            src="/vite.svg"
            width="32"
          />
        </a>
        <a href="https://tauri.app" rel="noopener" target="_blank">
          <img
            alt="Tauri logo"
            className="logo tauri"
            height="231"
            src="/tauri.svg"
            width="206"
          />
        </a>
        <a href="https://react.dev" rel="noopener" target="_blank">
          <img
            alt="React logo"
            className="logo react"
            height="32"
            src={reactLogo}
            width="36"
          />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
