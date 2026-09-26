import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  `http://${window.location.hostname}:3001`;

function getDeviceId() {
  let deviceId = localStorage.getItem("dropbox-device-id");

  if (!deviceId) {
    deviceId =
      "device-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 10);

    localStorage.setItem(
      "dropbox-device-id",
      deviceId
    );
  }

  return deviceId;
}

const deviceId = getDeviceId();

const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,

  auth: {
    deviceId,
  },
});

export default socket;