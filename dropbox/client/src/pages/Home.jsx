import { useState } from "react";
import {
  ArrowRight,
  Link2,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";

import CreateRoom from "../components/CreateRoom";
import JoinRoom from "../components/JoinRoom";

function Home({
  onRoomCreated,
  onRoomJoined,
  initialRoomCode = "",
  startWithJoin = false,
}) {
  const [mode, setMode] = useState(
    startWithJoin ? "join" : null
  );

  return (
    <main className="home">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />

      <nav className="navbar">
        <div className="brand">
          <div className="brand-mark">
            <Link2 size={19} strokeWidth={2.5} />
          </div>

          <span>DropBox</span>
        </div>

        <div className="nav-status">
          <span className="status-dot" />
          No account required
        </div>
      </nav>

      <section className="hero">
        <div className="hero-badge">
          <span>✦</span>
          Universal Device Bridge
        </div>

        <h1>
          Send anything.
          <br />
          <span>Between your devices.</span>
        </h1>

        <p className="hero-description">
          A temporary private space for moving files,
          links and text between your phone and laptop.
        </p>

        {!mode && (
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => setMode("create")}
            >
              Create a room
              <ArrowRight size={18} />
            </button>

            <button
              className="secondary-button"
              onClick={() => setMode("join")}
            >
              Join with code
            </button>
          </div>
        )}

        {mode === "create" && (
          <CreateRoom
            onRoomCreated={onRoomCreated}
            onBack={() => setMode(null)}
          />
        )}

        {mode === "join" && (
          <JoinRoom
            onRoomJoined={onRoomJoined}
            onBack={() => setMode(null)}
            initialRoomCode={initialRoomCode}
          />
        )}

        {!mode && (
          <div className="feature-row">
            <div className="feature">
              <Zap size={16} />
              <span>Instant</span>
            </div>

            <div className="feature">
              <ShieldCheck size={16} />
              <span>Temporary</span>
            </div>

            <div className="feature">
              <Smartphone size={16} />
              <span>Cross-device</span>
            </div>
          </div>
        )}
      </section>

      <footer className="home-footer">
        <span>DROPBOX</span>
        <span>Built for your devices.</span>
      </footer>
    </main>
  );
}

export default Home;