const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());
app.use(express.json());

// ==================================================
// SOCKET.IO
// ==================================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ==================================================
// TEMPORARY ROOM STORAGE
// ==================================================

const rooms = new Map();

// ==================================================
// TEMPORARY ROOM EXPIRATION
// ==================================================

const ROOM_EXPIRATION_TIME = 2 * 60 * 60 * 1000; // 2 hours

function cleanupExpiredRooms() {
  const now = Date.now();

  for (const [roomCode, room] of rooms.entries()) {
    const roomAge =
      now - room.createdAt;

    if (roomAge > ROOM_EXPIRATION_TIME) {
      console.log(
        `⏳ Room expired: ${roomCode}`
      );

      // Disconnect every device from
      // the Socket.IO room.
      for (const device of room.devices) {
        const deviceSocket =
          io.sockets.sockets.get(
            device.id
          );

        if (deviceSocket) {
          deviceSocket.leave(roomCode);

          deviceSocket.roomCode = null;

          deviceSocket.emit(
            "room-expired"
          );
        }
      }

      rooms.delete(roomCode);

      console.log(
        `🗑️ Expired room deleted: ${roomCode}`
      );
    }
  }
}

// Check rooms every 10 minutes
setInterval(
  cleanupExpiredRooms,
  10 * 60 * 1000
);

// ==================================================
// FILE UPLOAD STORAGE
// ==================================================

const uploadDir = path.join(__dirname, "uploads");

// Make sure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}-${file.originalname}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
});

// ==================================================
// TEMPORARY FILE CLEANUP
// ==================================================

const FILE_EXPIRATION_TIME = 60 * 60 * 1000; // 1 hour

function cleanupExpiredFiles() {
  if (!fs.existsSync(uploadDir)) {
    return;
  }

  const now = Date.now();

  fs.readdir(uploadDir, (error, files) => {
    if (error) {
      console.error(
        "❌ Could not read upload directory:",
        error.message
      );

      return;
    }

    files.forEach((filename) => {
      const filePath = path.join(
        uploadDir,
        filename
      );

      fs.stat(filePath, (statError, stats) => {
        if (statError) {
          return;
        }

        const fileAge =
          now - stats.mtimeMs;

        if (fileAge > FILE_EXPIRATION_TIME) {
          fs.unlink(filePath, (deleteError) => {
            if (deleteError) {
              console.error(
                `❌ Could not delete ${filename}:`,
                deleteError.message
              );

              return;
            }

            console.log(
              `🗑️ Expired file deleted: ${filename}`
            );
          });
        }
      });
    });
  });
}

// Run once when the server starts
cleanupExpiredFiles();

// Check every 10 minutes
setInterval(
  cleanupExpiredFiles,
  10 * 60 * 1000
);

// ==================================================
// ROOM HELPERS
// ==================================================

function generateRoomCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters.charAt(
      Math.floor(
        Math.random() * characters.length
      )
    );
  }

  return code;
}

function createUniqueRoomCode() {
  let code;

  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  return code;
}

function getRoomDevices(roomCode) {
  const room = rooms.get(roomCode);

  if (!room) {
    return [];
  }

  return room.devices;
}

// ==================================================
// BASIC API
// ==================================================

app.get("/", (req, res) => {
  res.json({
    name: "DropBox Universal Device Bridge",
    status: "online",
    version: "1.0.0",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
  });
});

// ==================================================
// FILE UPLOAD
// ==================================================

app.post(
  "/upload",
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file received.",
      });
    }

    const roomCode = req.body.roomCode;
    const socketId = req.body.socketId;

    if (!roomCode || !rooms.has(roomCode)) {
      return res.status(400).json({
        success: false,
        message: "Room not found.",
      });
    }

    if (!socketId) {
      return res.status(400).json({
        success: false,
        message: "Socket ID is required.",
      });
    }

    const room = rooms.get(roomCode);

    const deviceExists = room.devices.some(
      (device) => device.id === socketId
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message:
          "Device is not part of this room.",
      });
    }

    const fileData = {
      id: `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`,

      originalName: req.file.originalname,
      fileName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,

      downloadUrl: `/download/${req.file.filename}`,

      from: socketId,

      timestamp: Date.now(),
    };

    // Tell every other device in the room
    // that a file has arrived.
    io.to(roomCode)
      .except(socketId)
      .emit("receive-file", {
        file: fileData,
      });

    console.log("");
    console.log("📁 FILE UPLOADED");
    console.log(`Room: ${roomCode}`);
    console.log(
      `File: ${req.file.originalname}`
    );
    console.log(
      `Size: ${req.file.size} bytes`
    );
    console.log("");

    res.json({
      success: true,
      file: fileData,
    });
  }
);

// ==================================================
// FILE DOWNLOAD
// ==================================================

app.get(
  "/download/:filename",
  (req, res) => {
    const filename = req.params.filename;

    const filePath = path.join(
      uploadDir,
      filename
    );

    res.download(filePath, (error) => {
      if (error) {
        console.log(
          "❌ File download error:",
          error.message
        );
      }
    });
  }
);

// ==================================================
// SOCKET.IO CONNECTION
// ==================================================

io.on("connection", (socket) => {
  console.log(
    `🔌 Device connected: ${socket.id}`
  );
// ================================
// WEBRTC SIGNALING
// ================================

socket.on(
  "webrtc-offer",
  ({ targetSocketId, offer }) => {
    if (!targetSocketId || !offer) return;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (!targetSocket) return;

    // Only allow signaling between devices
    // in the same DropBox room.
    if (
      !socket.roomCode ||
      socket.roomCode !== targetSocket.roomCode
    ) {
      return;
    }

    targetSocket.emit("webrtc-offer", {
      senderSocketId: socket.id,
      offer,
    });
  }
);

socket.on(
  "webrtc-answer",
  ({ targetSocketId, answer }) => {
    if (!targetSocketId || !answer) return;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (!targetSocket) return;

    if (
      !socket.roomCode ||
      socket.roomCode !== targetSocket.roomCode
    ) {
      return;
    }

    targetSocket.emit("webrtc-answer", {
      senderSocketId: socket.id,
      answer,
    });
  }
);

socket.on(
  "webrtc-ice-candidate",
  ({ targetSocketId, candidate }) => {
    if (!targetSocketId || !candidate) return;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (!targetSocket) return;

    if (
      !socket.roomCode ||
      socket.roomCode !== targetSocket.roomCode
    ) {
      return;
    }

    targetSocket.emit("webrtc-ice-candidate", {
      senderSocketId: socket.id,
      candidate,
    });
  }
);
  // ==================================================
  // RECONNECT EXISTING DEVICE
  // ==================================================

const reconnectDeviceId =
  socket.handshake.auth?.deviceId;

if (reconnectDeviceId) {
  for (const [
    roomCode,
    room,
  ] of rooms.entries()) {
    const existingDevice =
      room.devices.find(
        (device) =>
          device.deviceId ===
          reconnectDeviceId
      );

    if (!existingDevice) {
      continue;
    }

    existingDevice.id = socket.id;
    existingDevice.connected = true;

    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log("");
    console.log("🔄 DEVICE RECONNECTED");
    console.log(`Room: ${roomCode}`);
    console.log(
      `Device: ${existingDevice.name}`
    );
    console.log("");

    io.to(roomCode).emit(
      "room-updated",
      {
        devices: room.devices,
      }
    );
    socket.emit("room-restored", {
      roomCode,
      devices: room.devices,
    });

    break;
  }
}
  // ==================================================
  // CREATE ROOM
  // ==================================================

  socket.on(
    "create-room",
    ({ deviceName }, callback) => {
      const roomCode =
        createUniqueRoomCode();

      const device = {
        id: socket.id,
        deviceId:
          socket.handshake.auth?.deviceId ||
          `device-${socket.id}`,
        name:
          deviceName?.trim() ||
          "Unknown Device",
        connected: true,
      };

      rooms.set(roomCode, {
        devices: [device],
        createdAt: Date.now(),
      });

      socket.join(roomCode);

      socket.roomCode = roomCode;

      console.log("");
      console.log("🏠 ROOM CREATED");
      console.log(`Room: ${roomCode}`);
      console.log(
        `Device: ${device.name}`
      );
      console.log("");

      callback({
        success: true,
        roomCode,
        devices:
          getRoomDevices(roomCode),
      });
    }
  );

  // ==================================================
  // JOIN ROOM
  // ==================================================

  socket.on(
    "join-room",
   ({ roomCode, deviceName, deviceId }, callback) => {
      const normalizedCode =
        roomCode?.trim().toUpperCase();

      const normalizedName =
        deviceName?.trim() ||
        "Unknown Device";

      if (!normalizedCode) {
        return callback({
          success: false,
          message:
            "Room code is required.",
        });
      }

      const room =
        rooms.get(normalizedCode);

      if (!room) {
        return callback({
          success: false,
          message:
            "Room not found or expired.",
        });
      }

      // Prevent duplicate join
      if (
        socket.roomCode ===
        normalizedCode
      ) {
        console.log(
          `⚠️ ${socket.id} already belongs to ${normalizedCode}`
        );

        return callback({
          success: true,
          roomCode: normalizedCode,
          devices: room.devices,
        });
      }

      // Remove socket from previous room
      if (socket.roomCode) {
        const previousRoom =
          rooms.get(socket.roomCode);

        if (previousRoom) {
          previousRoom.devices =
            previousRoom.devices.filter(
              (device) =>
                device.id !== socket.id
            );

          socket.leave(
            socket.roomCode
          );

          if (
            previousRoom.devices
              .length === 0
          ) {
            rooms.delete(
              socket.roomCode
            );

            console.log(
              `🗑️ Empty room deleted: ${socket.roomCode}`
            );
          } else {
            io.to(
              socket.roomCode
            ).emit(
              "room-updated",
              {
                devices:
                  previousRoom.devices,
              }
            );
          }
        }
      }

      const device = {
        id: socket.id,
        deviceId:
          deviceId ||
          socket.handshake.auth?.deviceId ||
          `device-${socket.id}`,
        name: normalizedName,
        connected: true,
      };

      room.devices.push(device);

      socket.join(normalizedCode);

      socket.roomCode =
        normalizedCode;

      console.log("");
      console.log("📱 DEVICE JOINED");
      console.log(
        `Room: ${normalizedCode}`
      );
      console.log(
        `Device: ${normalizedName}`
      );
      console.log(
        `Devices: ${room.devices.length}`
      );
      console.log("");

      io.to(normalizedCode).emit(
        "room-updated",
        {
          devices: room.devices,
        }
      );

      callback({
        success: true,
        roomCode: normalizedCode,
        devices: room.devices,
      });
    }
  );
  // ==================================================
// LEAVE ROOM
// ==================================================

socket.on("leave-room", () => {
  const roomCode = socket.roomCode;

  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);

  if (!room) {
    socket.roomCode = null;
    return;
  }

  const device = room.devices.find(
    (item) => item.id === socket.id
  );

  if (!device) {
    socket.roomCode = null;
    socket.leave(roomCode);
    return;
  }

  console.log("");
  console.log("🚪 DEVICE LEFT ROOM");
  console.log(`Room: ${roomCode}`);
  console.log(`Device: ${device.name}`);
  console.log("");

  // Remove device permanently from this room.
  room.devices = room.devices.filter(
    (item) =>
      item.deviceId !== device.deviceId
  );

  // Remove socket from Socket.IO room.
  socket.leave(roomCode);

  // Clear room association so reconnect
  // cannot automatically restore it.
  socket.roomCode = null;

  // Delete room if nobody remains.
  if (room.devices.length === 0) {
    rooms.delete(roomCode);

    console.log(
      `🗑️ Empty room deleted: ${roomCode}`
    );

    return;
  }

  // Tell remaining devices.
  io.to(roomCode).emit(
    "room-updated",
    {
      devices: room.devices,
    }
  );
});
  // ==================================================
  // SEND TEXT
  // ==================================================

  socket.on(
    "send-text",
    ({ text }) => {
      const roomCode =
        socket.roomCode;

      if (
        !roomCode ||
        !rooms.has(roomCode)
      ) {
        return;
      }

      socket
        .to(roomCode)
        .emit(
          "receive-text",
          {
            text,
            from: socket.id,
            timestamp: Date.now(),
          }
        );
    }
  );

  // ==================================================
  // SEND LINK
  // ==================================================

  socket.on(
    "send-link",
    ({ url }) => {
      const roomCode =
        socket.roomCode;

      if (
        !roomCode ||
        !rooms.has(roomCode)
      ) {
        return;
      }

      socket
        .to(roomCode)
        .emit(
          "receive-link",
          {
            url,
            from: socket.id,
            timestamp: Date.now(),
          }
        );
    }
  );

  // ==================================================
  // DISCONNECT
  // ==================================================

socket.on("disconnect", () => {
  console.log(
    `❌ Device disconnected: ${socket.id}`
  );

  const roomCode = socket.roomCode;

  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);

  if (!room) {
    return;
  }

  const device = room.devices.find(
    (item) => item.id === socket.id
  );

  if (!device) {
    return;
  }

  device.connected = false;

  console.log(
    `📡 ${device.name} temporarily disconnected`
  );

  io.to(roomCode).emit("room-updated", {
    devices: room.devices,
  });

  // Give the device time to reconnect.
  setTimeout(() => {
    const currentRoom = rooms.get(roomCode);

    if (!currentRoom) {
      return;
    }

    const currentDevice = currentRoom.devices.find(
      (item) =>
        item.deviceId === device.deviceId
    );

    if (
      currentDevice &&
      !currentDevice.connected
    ) {
      currentRoom.devices =
        currentRoom.devices.filter(
          (item) =>
            item.deviceId !== device.deviceId
        );

      console.log(
        `🗑️ Device removed after reconnect timeout: ${device.name}`
      );

      if (currentRoom.devices.length === 0) {
        rooms.delete(roomCode);

        console.log(
          `🗑️ Room deleted: ${roomCode}`
        );

        return;
      }

      io.to(roomCode).emit(
        "room-updated",
        {
          devices: currentRoom.devices,
        }
      );
    }
  }, 15000);
});
});

// ==================================================
// START SERVER
// ==================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "🚀 DROPBOX SERVER"
    );
    console.log(
      "===================================="
    );
    console.log(
      `Local:   http://localhost:${PORT}`
    );
    console.log(
      `Network: http://YOUR-IP:${PORT}`
    );
    console.log(
      "===================================="
    );
    console.log("");
  }
);