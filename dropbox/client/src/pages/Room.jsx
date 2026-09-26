import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Link2,
  Monitor,
  Smartphone,
  Wifi,
  Share2,
  Check,
  Clock3,
} from "lucide-react";
import {
  connectToDevice,
} from "../webrtcManager";
import SharePanel from "../components/SharePanel";
import { QRCodeSVG } from "qrcode.react";

import socket from "../socket";

// Your laptop's local Wi-Fi IP
const DEVICE_HOST = "192.168.1.4";

function Room({ roomData, onBack, showToast }) {
  const [devices, setDevices] = useState(
    roomData?.devices || []
  );

  const [copied, setCopied] = useState(false);
  const [roomExpired, setRoomExpired] = useState(false);

  const roomCode = roomData?.roomCode;

  // -----------------------------------------------
  // Listen for device changes + room expiration
  // -----------------------------------------------

  useEffect(() => {
    const handleRoomUpdate = (data) => {
      setDevices(data.devices || []);
    };

    const handleRoomExpired = () => {
      console.log("⏳ ROOM EXPIRED");

      setRoomExpired(true);
    };

    socket.on("room-updated", handleRoomUpdate);
    socket.on("room-expired", handleRoomExpired);

    return () => {
      socket.off("room-updated", handleRoomUpdate);
      socket.off("room-expired", handleRoomExpired);
    };
  }, []);
useEffect(() => {
  if (!devices || devices.length < 2) {
    return;
  }

  const myDeviceId =
    localStorage.getItem("dropbox-device-id");

  if (!myDeviceId) {
    return;
  }

  const otherDevices = devices.filter(
    (device) =>
      device.id !== socket.id &&
      device.connected !== false
  );

  otherDevices.forEach((device) => {
    if (!device.deviceId) {
      return;
    }

    // Only one device initiates the connection.
    if (myDeviceId < device.deviceId) {
      connectToDevice(device);
    }
  });
}, [devices]);

  // -----------------------------------------------
  // QR / Share URL
  // -----------------------------------------------

  const shareUrl = `http://${DEVICE_HOST}:5173/?room=${roomCode}`;

  // -----------------------------------------------
  // Copy room code
  // -----------------------------------------------

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      showToast?.("Room code copied");

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error(
        "Failed to copy room code:",
        error
      );
    }
  };

  // -----------------------------------------------
  // Share room
  // -----------------------------------------------

  const shareRoom = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join my DropBox room",
          text: `Join my DropBox room using code ${roomCode}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast?.("Share link copied");

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 1800);
      }
    } catch (error) {
      // User cancelled the native share menu.
      if (error?.name !== "AbortError") {
        console.error(
          "Share failed:",
          error
        );
      }
    }
  };

  // -----------------------------------------------
  // ROOM EXPIRED
  // -----------------------------------------------

  if (roomExpired) {
    return (
      <main className="room-page">
        <div className="room-background-glow" />

        <section className="room-expired-card">
          <div className="room-expired-icon">
            <Clock3 size={25} />
          </div>

          <span className="room-eyebrow">
            ROOM EXPIRED
          </span>

          <h1>This room has expired</h1>

          <p>
            This temporary DropBox room is no
            longer available. Create a new room
            to continue sharing between your
            devices.
          </p>

          <button
            className="primary-button"
            onClick={onBack}
            type="button"
          >
            Create a new room
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="room-page">
      <div className="room-background-glow" />

      {/* -------------------------------------------
          HEADER
      -------------------------------------------- */}

      <header className="room-header">
        <button
          className="back-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={17} />
          Leave room
        </button>

        <div className="brand">
          <div className="brand-mark">
            <Link2 size={18} />
          </div>

          <span>DropBox</span>
        </div>

        <div className="connection-status">
          <span className="status-dot" />
          Connected
        </div>
      </header>

      {/* -------------------------------------------
          MAIN CONTENT
      -------------------------------------------- */}

      <section className="room-content">
        <div className="room-title">
          <span className="room-eyebrow">
            TEMPORARY ROOM
          </span>

          <h1>Connect another device</h1>

          <p>
            Scan this QR code or enter the room code on
            another device.
          </p>
        </div>

        {/* -----------------------------------------
            QR CONNECTION CARD
        ------------------------------------------ */}

        <div className="connection-card">
          <div className="qr-wrapper">
            <QRCodeSVG
              value={shareUrl}
              size={210}
              bgColor="#ffffff"
              fgColor="#111111"
              level="H"
            />
          </div>

          <div className="room-code-section">
            <span>ROOM CODE</span>

            <div className="room-code">
              {roomCode}

              <button
                onClick={copyCode}
                title="Copy room code"
                type="button"
              >
                {copied ? (
                  <Check size={17} />
                ) : (
                  <Copy size={17} />
                )}
              </button>
            </div>

            <p>
              Scan the QR code with your phone or enter
              this code manually.
            </p>

            <button
              className="secondary-button"
              onClick={shareRoom}
              type="button"
            >
              <Share2 size={16} />
              Share room
            </button>
          </div>
        </div>

        {/* -----------------------------------------
            CONNECTED DEVICES
        ------------------------------------------ */}

        <div className="devices-section">
          <div className="section-heading">
            <div>
              <span className="room-eyebrow">
                DEVICES
              </span>

              <h2>
                {devices.filter(
                  (device) => device.connected !== false
                ).length}{" "}
                {devices.filter(
                  (device) => device.connected !== false
                ).length === 1
                  ? "device"
                  : "devices"}{" "}
                connected
              </h2>
            </div>

            <Wifi size={20} />
          </div>

          <div className="devices-list">
            {devices.map((device) => {
              const isPhone = device.name
                ?.toLowerCase()
                .includes("phone");

              return (
                <div
                  className="device-card"
                  key={device.id}
                >
                  <div className="device-icon">
                    {isPhone ? (
                      <Smartphone size={20} />
                    ) : (
                      <Monitor size={20} />
                    )}
                  </div>

                  <div>
                  <strong>
                    {device.name}
                  </strong>

                  <span>
                    {device.connected === false
                      ? "Reconnecting..."
                      : "Connected"}
                  </span>
                </div>

                <div
                  className={`device-dot ${
                    device.connected === false
                      ? "device-dot-reconnecting"
                      : ""
                  }`}
                />
                </div>
              );
            })}
          </div>
        </div>

        <SharePanel roomCode={roomCode}  showToast={showToast} />
      </section>
    </main>
  );
}

export default Room;