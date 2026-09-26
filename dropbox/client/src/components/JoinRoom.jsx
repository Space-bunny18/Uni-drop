import { useState } from "react";
import {
  ArrowLeft,
  Smartphone,
  LoaderCircle,
} from "lucide-react";

import socket from "../socket";

function JoinRoom({
  onRoomJoined,
  onBack,
  initialRoomCode = "",
}) {
  const [roomCode, setRoomCode] = useState(
    initialRoomCode
  );

  const [deviceName, setDeviceName] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const joinRoom = () => {
    const code = roomCode.trim().toUpperCase();
    const name = deviceName.trim();

    setError("");

    if (!name) {
      setError("Give this device a name first.");
      return;
    }

    if (code.length !== 6) {
      setError("Enter the 6-character room code.");
      return;
    }

    if (!socket.connected) {
      setError(
        "Connecting to DropBox server..."
      );

      socket.connect();

      return;
    }

    setLoading(true);

    console.log("Joining room:", {
      roomCode: code,
      deviceName: name,
    });
    socket.emit(
      "join-room",
      {
        roomCode: code,
        deviceName: name,
        deviceId: localStorage.getItem("dropbox-device-id"),
      },
      (response) => {
        console.log(
          "Join response:",
          response
        );

        setLoading(false);

        if (!response) {
          setError(
            "No response received from server."
          );

          return;
        }

        if (!response.success) {
          setError(
            response.message ||
              "Could not join room."
          );

          return;
        }

        console.log(
          "🟢 JOIN SUCCESS"
        );

        onRoomJoined({
          roomCode: response.roomCode,
          devices: response.devices,
        });
      }
    );
  };

  return (
    <div className="room-form-card">
      <button
        className="back-button"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="form-icon">
        <Smartphone size={22} />
      </div>

      <h2>
        {initialRoomCode
          ? "Join this room"
          : "Join a room"}
      </h2>

      <p>
        {initialRoomCode
          ? "You've been invited to a temporary DropBox room."
          : "Enter the code displayed on your other device."}
      </p>

      <label>Room code</label>

      <input
        className="room-code-input"
        type="text"
        maxLength={6}
        placeholder="A7K92P"
        value={roomCode}
        onChange={(e) =>
          setRoomCode(
            e.target.value.toUpperCase()
          )
        }
      />

      <label>Device name</label>

      <input
        type="text"
        placeholder="e.g. Harsh's Phone"
        value={deviceName}
        onChange={(e) =>
          setDeviceName(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            joinRoom();
          }
        }}
      />

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      <button
        className="primary-button full-width"
        onClick={joinRoom}
        disabled={loading}
        type="button"
      >
        {loading ? (
          <>
            <LoaderCircle
              size={17}
              className="spin"
            />
            Joining...
          </>
        ) : (
          "Join room"
        )}
      </button>
    </div>
  );
}

export default JoinRoom;