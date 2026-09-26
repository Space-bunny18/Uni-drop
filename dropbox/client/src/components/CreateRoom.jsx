import { useState } from "react";
import {
  ArrowLeft,
  Laptop,
  Smartphone,
} from "lucide-react";

import socket from "../socket";

function CreateRoom({ onRoomCreated, onBack }) {
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createRoom = () => {
    if (!deviceName.trim()) {
      setError("Give this device a name first.");
      return;
    }

    setLoading(true);
    setError("");

    socket.emit(
      "create-room",
      {
        deviceName: deviceName.trim(),
      },
      (response) => {
        setLoading(false);

        if (!response?.success) {
          setError(response?.message || "Could not create room.");
          return;
        }

        onRoomCreated(response);
      }
    );
  };

  return (
    <div className="room-form-card">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="form-icon">
        <Laptop size={22} />
      </div>

      <h2>Create a room</h2>

      <p>
        Give this device a name so other devices can identify it.
      </p>

      <label>Device name</label>

      <input
        type="text"
        placeholder="e.g. Harsh's Laptop"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            createRoom();
          }
        }}
      />

      {error && <div className="form-error">{error}</div>}

      <button
        className="primary-button full-width"
        onClick={createRoom}
        disabled={loading}
      >
        {loading ? "Creating..." : "Create temporary room"}
      </button>

      <div className="form-note">
        <Smartphone size={14} />
        You'll get a QR code to connect another device.
      </div>
    </div>
  );
}

export default CreateRoom;