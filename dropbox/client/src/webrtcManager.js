import socket from "./socket";
import { createPeerConnection } from "./webrtc";

const peers = new Map();
const messageListeners = new Set();
const fileListeners = new Set();

/*
==================================================
FILE TRANSFER CONFIG
==================================================
*/

const FILE_CHUNK_SIZE = 16 * 1024; // 16 KB

/*
==================================================
INCOMING FILE TRANSFERS
==================================================
*/

const incomingTransfers = new Map();

/*
==================================================
INCOMING DATA CHANNEL
==================================================
*/

function handleIncomingChannel(
  channel,
  targetSocketId
) {
  console.log(
    "📡 WebRTC data channel received:",
    channel.label
  );

  const connection =
    peers.get(targetSocketId);

  if (connection) {
    connection.dataChannel = channel;
  }

  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    console.log(
      `🟢 WebRTC data channel open: ${targetSocketId}`
    );
  };

  channel.onclose = () => {
    console.log(
      `🔴 WebRTC data channel closed: ${targetSocketId}`
    );
  };

  channel.onerror = (error) => {
    console.error(
      "❌ WebRTC data channel error:",
      error
    );
  };

  channel.onmessage = (event) => {
    /*
    ----------------------------------------------
    Binary data = file chunk
    ----------------------------------------------
    */

    if (
      event.data instanceof ArrayBuffer
    ) {
      handleFileChunk(
        event.data,
        targetSocketId
      );

      return;
    }

    if (
      event.data instanceof Blob
    ) {
      event.data
        .arrayBuffer()
        .then((buffer) => {
          handleFileChunk(
            buffer,
            targetSocketId
          );
        })
        .catch((error) => {
          console.error(
            "❌ Failed to read file chunk:",
            error
          );
        });

      return;
    }

    /*
    ----------------------------------------------
    Text = control/message data
    ----------------------------------------------
    */

    console.log(
      "📨 WebRTC message received:",
      event.data
    );

    let data = event.data;

    try {
      data = JSON.parse(event.data);
    } catch {
      // Normal text message
    }

    /*
    ----------------------------------------------
    File protocol messages
    ----------------------------------------------
    */

    if (
      data &&
      typeof data === "object" &&
      data.type === "file-start"
    ) {
      handleFileStart(
        data,
        targetSocketId
      );

      return;
    }

    if (
      data &&
      typeof data === "object" &&
      data.type === "file-end"
    ) {
      handleFileEnd(
        data,
        targetSocketId
      );

      return;
    }

    if (
      data &&
      typeof data === "object" &&
      data.type === "file-abort"
    ) {
      handleFileAbort(
        data,
        targetSocketId
      );

      return;
    }

    /*
    ----------------------------------------------
    Normal text/link message
    ----------------------------------------------
    */

    messageListeners.forEach(
      (listener) => {
        listener(
          data,
          targetSocketId
        );
      }
    );
  };
}

/*
==================================================
FILE RECEIVE: START
==================================================
*/

function handleFileStart(
  data,
  targetSocketId
) {
  const {
    transferId,
    name,
    size,
    type,
  } = data;

  if (!transferId) {
    return;
  }

  console.log(
    "📥 File transfer started:",
    name
  );

  incomingTransfers.set(
    transferId,
    {
      transferId,
      name,
      size,
      type:
        type ||
        "application/octet-stream",
      chunks: [],
      received: 0,
      deviceId: targetSocketId,
    }
  );

  fileListeners.forEach(
    (listener) => {
      listener({
        type: "start",
        transferId,
        name,
        size,
        mimeType:
          type ||
          "application/octet-stream",
        received: 0,
        progress: 0,
        deviceId: targetSocketId,
      });
    }
  );
}

/*
==================================================
FILE RECEIVE: CHUNK
==================================================
*/

function handleFileChunk(
  chunk,
  targetSocketId
) {
  /*
  ----------------------------------------------
  Find the active transfer.

  Because DataChannel messages are ordered,
  the newest active transfer from this device
  is the transfer receiving this chunk.
  ----------------------------------------------
  */

  const transfers =
    Array.from(
      incomingTransfers.values()
    ).filter(
      (transfer) =>
        transfer.deviceId ===
        targetSocketId
    );

  if (transfers.length === 0) {
    console.warn(
      "⚠️ Received file chunk without active transfer"
    );

    return;
  }

  const transfer =
    transfers[transfers.length - 1];

  transfer.chunks.push(chunk);

  transfer.received +=
    chunk.byteLength;

  const progress =
    transfer.size > 0
      ? Math.min(
          (transfer.received /
            transfer.size) *
            100,
          100
        )
      : 0;

  fileListeners.forEach(
    (listener) => {
      listener({
        type: "progress",
        transferId:
          transfer.transferId,
        name: transfer.name,
        size: transfer.size,
        received:
          transfer.received,
        progress,
        deviceId:
          targetSocketId,
      });
    }
  );
}

/*
==================================================
FILE RECEIVE: END
==================================================
*/

function handleFileEnd(
  data,
  targetSocketId
) {
  const transfer =
    incomingTransfers.get(
      data.transferId
    );

  if (!transfer) {
    console.warn(
      "⚠️ File transfer not found:",
      data.transferId
    );

    return;
  }

  console.log(
    "📦 Reassembling file:",
    transfer.name
  );

  const blob = new Blob(
    transfer.chunks,
    {
      type: transfer.type,
    }
  );

  const url =
    URL.createObjectURL(blob);

  console.log(
    "✅ File received:",
    transfer.name
  );

  fileListeners.forEach(
    (listener) => {
      listener({
        type: "complete",
        transferId:
          transfer.transferId,
        name: transfer.name,
        size: transfer.size,
        received:
          transfer.received,
        progress: 100,
        mimeType:
          transfer.type,
        blob,
        url,
        deviceId:
          targetSocketId,
      });
    }
  );

  incomingTransfers.delete(
    transfer.transferId
  );

  /*
  ----------------------------------------------
  Keep the object URL alive for the UI.

  The UI can revoke it later after the
  download/preview is finished.
  ----------------------------------------------
  */
}

/*
==================================================
FILE RECEIVE: ABORT
==================================================
*/

function handleFileAbort(
  data,
  targetSocketId
) {
  const transfer =
    incomingTransfers.get(
      data.transferId
    );

  if (!transfer) {
    return;
  }

  console.warn(
    "⚠️ File transfer aborted:",
    transfer.name
  );

  incomingTransfers.delete(
    data.transferId
  );

  fileListeners.forEach(
    (listener) => {
      listener({
        type: "error",
        transferId:
          transfer.transferId,
        name: transfer.name,
        error:
          data.reason ||
          "Transfer aborted",
        deviceId:
          targetSocketId,
      });
    }
  );
}

/*
==================================================
CREATE WEBRTC CONNECTION
==================================================
*/

export function connectToDevice(
  targetDevice
) {
  if (!targetDevice?.id) {
    return;
  }

  if (
    targetDevice.id ===
    socket.id
  ) {
    return;
  }

  if (
    peers.has(
      targetDevice.id
    )
  ) {
    console.log(
      "⚠️ WebRTC peer already exists:",
      targetDevice.id
    );

    return;
  }

  const peer =
    createPeerConnection({
      onIceCandidate: (
        candidate
      ) => {
        socket.emit(
          "webrtc-ice-candidate",
          {
            targetSocketId:
              targetDevice.id,
            candidate,
          }
        );
      },

      onDataChannel: (
        channel
      ) => {
        handleIncomingChannel(
          channel,
          targetDevice.id
        );
      },

      onConnectionStateChange: (
        state
      ) => {
        console.log(
          `🔗 WebRTC ${targetDevice.name}:`,
          state
        );

        if (
          state === "failed" ||
          state === "closed"
        ) {
          peers.delete(
            targetDevice.id
          );
        }
      },
    });

  const dataChannel =
    peer.createDataChannel(
      "dropbox-data"
    );

  handleIncomingChannel(
    dataChannel,
    targetDevice.id
  );

  peers.set(
    targetDevice.id,
    {
      peer,
      dataChannel,
    }
  );

  createOffer(
    peer,
    targetDevice.id
  );
}

/*
==================================================
CREATE OFFER
==================================================
*/

async function createOffer(
  peer,
  targetSocketId
) {
  try {
    const offer =
      await peer.createOffer();

    await peer.setLocalDescription(
      offer
    );

    socket.emit(
      "webrtc-offer",
      {
        targetSocketId,
        offer,
      }
    );

    console.log(
      "📤 WebRTC offer sent"
    );
  } catch (error) {
    console.error(
      "❌ Failed to create WebRTC offer:",
      error
    );
  }
}

/*
==================================================
WEBRTC OFFER
==================================================
*/

socket.on(
  "webrtc-offer",
  async ({
    senderSocketId,
    offer,
  }) => {
    console.log(
      "📨 WebRTC offer received:",
      senderSocketId
    );

    if (
      peers.has(senderSocketId)
    ) {
      console.log(
        "⚠️ WebRTC connection already exists, ignoring duplicate offer"
      );

      return;
    }

    const peer =
      createPeerConnection({
        onIceCandidate: (
          candidate
        ) => {
          socket.emit(
            "webrtc-ice-candidate",
            {
              targetSocketId:
                senderSocketId,
              candidate,
            }
          );
        },

        onDataChannel: (
          channel
        ) => {
          handleIncomingChannel(
            channel,
            senderSocketId
          );
        },

        onConnectionStateChange: (
          state
        ) => {
          console.log(
            `🔗 WebRTC connection: ${state}`
          );

          if (
            state === "failed" ||
            state === "closed"
          ) {
            peers.delete(
              senderSocketId
            );
          }
        },
      });

    const connection = {
      peer,
      dataChannel: null,
    };

    peers.set(
      senderSocketId,
      connection
    );

    try {
      await peer.setRemoteDescription(
        offer
      );

      const answer =
        await peer.createAnswer();

      await peer.setLocalDescription(
        answer
      );

      socket.emit(
        "webrtc-answer",
        {
          targetSocketId:
            senderSocketId,
          answer,
        }
      );

      console.log(
        "📤 WebRTC answer sent"
      );
    } catch (error) {
      console.error(
        "❌ Failed to handle WebRTC offer:",
        error
      );

      peers.delete(
        senderSocketId
      );
    }
  }
);

/*
==================================================
WEBRTC ANSWER
==================================================
*/

socket.on(
  "webrtc-answer",
  async ({
    senderSocketId,
    answer,
  }) => {
    console.log(
      "📨 WebRTC answer received:",
      senderSocketId
    );

    const connection =
      peers.get(senderSocketId);

    if (!connection) {
      console.log(
        "⚠️ No WebRTC peer found for answer"
      );

      return;
    }

    try {
      await connection.peer.setRemoteDescription(
        answer
      );

      console.log(
        "🟢 WebRTC connection negotiated"
      );
    } catch (error) {
      console.error(
        "❌ Failed to handle WebRTC answer:",
        error
      );
    }
  }
);

/*
==================================================
ICE CANDIDATE
==================================================
*/

socket.on(
  "webrtc-ice-candidate",
  async ({
    senderSocketId,
    candidate,
  }) => {
    const connection =
      peers.get(senderSocketId);

    if (!connection) {
      return;
    }

    try {
      await connection.peer.addIceCandidate(
        candidate
      );
    } catch (error) {
      console.error(
        "❌ Failed to add ICE candidate:",
        error
      );
    }
  }
);

/*
==================================================
SEND TEXT / LINK / NORMAL DATA
==================================================
*/

export function sendWebRTCData(
  data
) {
  const payload =
    typeof data === "string"
      ? data
      : JSON.stringify(data);

  let sent = false;

  for (const connection of peers.values()) {
    const channel =
      connection.dataChannel;

    if (
      channel &&
      channel.readyState === "open"
    ) {
      channel.send(payload);

      console.log(
        "🚀 Data sent via WebRTC"
      );

      sent = true;
    }
  }

  return sent;
}

/*
==================================================
SEND FILE
==================================================
*/

export async function sendFileWebRTC(
  file,
  {
    onStart,
    onProgress,
    onComplete,
    onError,
  } = {}
) {
  if (!file) {
    return false;
  }

  const activeConnections =
    Array.from(
      peers.values()
    ).filter(
      (connection) =>
        connection.dataChannel &&
        connection.dataChannel
          .readyState === "open"
    );

  if (
    activeConnections.length === 0
  ) {
    console.log(
      "📡 No WebRTC data channel available for file transfer"
    );

    return false;
  }

  const transferId =
    `file-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const metadata = {
    type: "file-start",
    transferId,
    name: file.name,
    size: file.size,
    mimeType:
      file.type ||
      "application/octet-stream",
  };

  console.log(
    "📤 Starting WebRTC file transfer:",
    file.name
  );

  onStart?.({
    transferId,
    name: file.name,
    size: file.size,
  });

  /*
  ----------------------------------------------
  Send metadata first
  ----------------------------------------------
  */

  for (const connection of activeConnections) {
    connection.dataChannel.send(
      JSON.stringify(metadata)
    );
  }

  let offset = 0;

  try {
    while (
      offset < file.size
    ) {
      /*
      ------------------------------------------
      Wait for DataChannel buffer.
      This prevents us from pushing thousands
      of chunks into memory at once.
      ------------------------------------------
      */

      for (
        const connection of
          activeConnections
      ) {
        await waitForBuffer(
          connection.dataChannel
        );
      }

      const end =
        Math.min(
          offset +
            FILE_CHUNK_SIZE,
          file.size
        );

      const chunk =
        await file
          .slice(
            offset,
            end
          )
          .arrayBuffer();

      for (
        const connection of
          activeConnections
      ) {
        if (
          connection.dataChannel
            .readyState !== "open"
        ) {
          throw new Error(
            "WebRTC connection closed during file transfer"
          );
        }

        connection.dataChannel.send(
          chunk
        );
      }

      offset = end;

      const progress =
        file.size > 0
          ? Math.min(
              (offset /
                file.size) *
                100,
              100
            )
          : 100;

      onProgress?.({
        transferId,
        name: file.name,
        size: file.size,
        sent: offset,
        progress,
      });
    }

    /*
    ----------------------------------------------
    Send completion message
    ----------------------------------------------
    */

    const endMessage = {
      type: "file-end",
      transferId,
    };

    for (
      const connection of
        activeConnections
    ) {
      await waitForBuffer(
        connection.dataChannel
      );

      connection.dataChannel.send(
        JSON.stringify(
          endMessage
        )
      );
    }

    console.log(
      "✅ WebRTC file transfer complete:",
      file.name
    );

    onComplete?.({
      transferId,
      name: file.name,
      size: file.size,
    });

    return true;
  } catch (error) {
    console.error(
      "❌ WebRTC file transfer failed:",
      error
    );

    const abortMessage = {
      type: "file-abort",
      transferId,
      reason:
        error.message ||
        "File transfer failed",
    };

    for (
      const connection of
        activeConnections
    ) {
      if (
        connection.dataChannel &&
        connection.dataChannel
          .readyState === "open"
      ) {
        connection.dataChannel.send(
          JSON.stringify(
            abortMessage
          )
        );
      }
    }

    onError?.(error);

    return false;
  }
}

/*
==================================================
DATA CHANNEL BACKPRESSURE
==================================================
*/

function waitForBuffer(
  channel
) {
  if (
    !channel ||
    channel.readyState !== "open"
  ) {
    return Promise.reject(
      new Error(
        "DataChannel is not open"
      )
    );
  }

  /*
  ----------------------------------------------
  If buffer is already reasonable,
  continue immediately.
  ----------------------------------------------
  */

  if (
    channel.bufferedAmount <
    512 * 1024
  ) {
    return Promise.resolve();
  }

  /*
  ----------------------------------------------
  Wait until the buffered amount drops.
  ----------------------------------------------
  */

  return new Promise(
    (resolve, reject) => {
      const previousThreshold =
        channel.bufferedAmountLowThreshold;

      channel.bufferedAmountLowThreshold =
        256 * 1024;

      const cleanup = () => {
        channel.removeEventListener(
          "bufferedamountlow",
          handleLow
        );

        channel.bufferedAmountLowThreshold =
          previousThreshold;
      };

      const handleLow = () => {
        cleanup();
        resolve();
      };

      channel.addEventListener(
        "bufferedamountlow",
        handleLow
      );

      setTimeout(() => {
        cleanup();

        if (
          channel.readyState ===
          "open"
        ) {
          resolve();
        } else {
          reject(
            new Error(
              "DataChannel closed while waiting for buffer"
            )
          );
        }
      }, 5000);
    }
  );
}

/*
==================================================
WEBRTC CLEANUP
==================================================
*/

export function leaveWebRTC() {
  console.log(
    "🧹 Cleaning up WebRTC connections"
  );

  for (const [
    deviceId,
    connection,
  ] of peers.entries()) {
    const channel =
      connection.dataChannel;

    const peer =
      connection.peer;

    if (
      channel &&
      channel.readyState !== "closed"
    ) {
      channel.close();
    }

    if (
      peer &&
      peer.connectionState !== "closed"
    ) {
      peer.close();
    }

    console.log(
      `🔴 WebRTC peer closed: ${deviceId}`
    );
  }

  peers.clear();

  incomingTransfers.clear();

  console.log(
    "🧹 WebRTC cleanup complete"
  );
}

/*
==================================================
NORMAL MESSAGE SUBSCRIBER
==================================================
*/

export function subscribeToWebRTCMessages(
  listener
) {
  messageListeners.add(
    listener
  );

  return () => {
    messageListeners.delete(
      listener
    );
  };
}

/*
==================================================
FILE TRANSFER SUBSCRIBER
==================================================
*/

export function subscribeToWebRTCFiles(
  listener
) {
  fileListeners.add(
    listener
  );

  return () => {
    fileListeners.delete(
      listener
    );
  };
}

/*
==================================================
PEER ACCESS
==================================================
*/

export function getPeer(
  deviceId
) {
  return peers.get(
    deviceId
  );
}

export function getPeers() {
  return peers;
}