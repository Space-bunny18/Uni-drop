import { useEffect, useState } from "react";
import Home from "./pages/Home";
import Room from "./pages/Room";
import socket from "./socket";
import { leaveWebRTC } from "./webrtcManager";
import Toast from "./components/Toast";
import "./App.css";

function App() {
  const params = new URLSearchParams(window.location.search);
  const initialRoomCode = params.get("room")?.toUpperCase() || "";

  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setToast({
      message,
      type,
    });
  };

  const closeToast = () => {
    setToast({
      message: "",
      type: "success",
    });
  };

  const [screen, setScreen] = useState(
    initialRoomCode ? "join" : "home"
  );

  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    const handleRoomRestored = (data) => {
      console.log("🔄 ROOM RESTORED:", data);

      setRoomData({
        roomCode: data.roomCode,
        devices: data.devices || [],
      });

      setScreen("room");
    };

    socket.on("room-restored", handleRoomRestored);

    return () => {
      socket.off("room-restored", handleRoomRestored);
    };
  }, []);

  const handleRoomCreated = (data) => {
    console.log("🟢 ROOM CREATED:", data);

    setRoomData(data);
    setScreen("room");

    showToast("Room created successfully");
  };

  const handleRoomJoined = (data) => {
    console.log("🟢 ROOM JOINED:", data);

    setRoomData(data);
    setScreen("room");

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );

    showToast("Joined room successfully");
  };

  const handleBack = () => {
    leaveWebRTC();

    socket.emit("leave-room");

    setRoomData(null);
    setScreen("home");

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );
  };

  console.log("🔵 APP:", {
    screen,
    roomData,
    initialRoomCode,
  });

  return (
    <>
      {screen === "room" && roomData ? (
        <Room
          roomData={roomData}
          onBack={handleBack}
          showToast={showToast}
        />
      ) : (
        <Home
          onRoomCreated={handleRoomCreated}
          onRoomJoined={handleRoomJoined}
          initialRoomCode={initialRoomCode}
          startWithJoin={Boolean(initialRoomCode)}
          showToast={showToast}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={closeToast}
      />
    </>
  );
}

export default App;