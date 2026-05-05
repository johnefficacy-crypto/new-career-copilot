import { useState } from "react";
import {
  signInWithEmail,
  signOut,
  getCurrentSession,
} from "./lib/auth";
import { getMe } from "./lib/api";

export default function AuthTest() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [output, setOutput] = useState("");

  async function handleLogin() {
    try {
      const { data, error } = await signInWithEmail(email, password);

      if (error) {
        setOutput(error.message);
        return;
      }

      setOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      setOutput(err.message);
    }
  }

  async function handleSession() {
    try {
      const session = await getCurrentSession();
      setOutput(JSON.stringify(session, null, 2));
    } catch (err) {
      setOutput(err.message);
    }
  }

  async function handleMe() {
    try {
      const me = await getMe();
      setOutput(JSON.stringify(me, null, 2));
    } catch (err) {
      setOutput(err.message);
    }
  }

  async function handleLogout() {
    await signOut();
    setOutput("Logged out");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Auth Test</h1>

      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button onClick={handleLogin}>Login</button>
        <button onClick={handleSession}>Get Session</button>
        <button onClick={handleMe}>Call /api/auth/me</button>
        <button onClick={handleLogout}>Logout</button>
      </div>

      <pre>{output}</pre>
    </div>
  );
}