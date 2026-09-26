import { useEffect, useRef, useState } from "react";
import {
  Clipboard,
  File,
  Link as LinkIcon,
  Send,
  Check,
  Upload,
  Download,
  X,
} from "lucide-react";

import socket from "../socket";
import {
  sendWebRTCData,
  sendFileWebRTC,
  subscribeToWebRTCMessages,
  subscribeToWebRTCFiles,
} from "../webrtcManager";

function createMessageId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];

  const index = Math.floor(
    Math.log(bytes) / Math.log(1024)
  );

  const safeIndex = Math.min(
    index,
    units.length - 1
  );

  const size =
    bytes / Math.pow(1024, safeIndex);

  return `${size.toFixed(
    safeIndex === 0 ? 0 : 1
  )} ${units[safeIndex]}`;
}

function SharePanel({ roomCode, showToast }) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [receivedItems, setReceivedItems] =
    useState([]);

  const [sent, setSent] = useState(null);

  // Multiple files
  const [selectedFiles, setSelectedFiles] =
    useState([]);

  const [uploading, setUploading] =
    useState(false);

  const [currentUploadIndex, setCurrentUploadIndex] =
    useState(0);

  const [uploadProgress, setUploadProgress] =
    useState(0);

  const [fileError, setFileError] =
    useState("");

  const [failedFiles, setFailedFiles] =
    useState([]);

  const fileInputRef = useRef(null);

  // ==================================================
  // SOCKET.IO RECEIVE
  // ==================================================

  useEffect(() => {
    const handleText = (data) => {
      setReceivedItems((prev) => [
        {
          id: createMessageId(),
          type: "text",
          content: data.text,
          timestamp: data.timestamp,
        },
        ...prev,
      ]);
    };

    const handleLink = (data) => {
      setReceivedItems((prev) => [
        {
          id: createMessageId(),
          type: "link",
          content: data.url,
          timestamp: data.timestamp,
        },
        ...prev,
      ]);
    };

    const handleFile = (data) => {
      if (!data?.file) {
        return;
      }

      setReceivedItems((prev) => [
        {
          id: createMessageId(),
          type: "file",
          file: data.file,
          timestamp: data.file.timestamp,
        },
        ...prev,
      ]);
    };

    socket.on("receive-text", handleText);
    socket.on("receive-link", handleLink);
    socket.on("receive-file", handleFile);

    return () => {
      socket.off("receive-text", handleText);
      socket.off("receive-link", handleLink);
      socket.off("receive-file", handleFile);
    };
  }, []);

  // ==================================================
  // WEBRTC RECEIVE
  // ==================================================

  useEffect(() => {
    const unsubscribeMessages =
      subscribeToWebRTCMessages(
        (rawData) => {
          try {
            const data =
              typeof rawData === "string"
                ? JSON.parse(rawData)
                : rawData;

            if (!data?.type) {
              return;
            }

            // ------------------------------
            // TEXT
            // ------------------------------

            if (data.type === "text") {
              setReceivedItems((prev) => [
                {
                  id: createMessageId(),
                  type: "text",
                  content: data.text,
                  timestamp:
                    data.timestamp ||
                    Date.now(),
                },
                ...prev,
              ]);

              return;
            }

            // ------------------------------
            // LINK
            // ------------------------------

            if (data.type === "link") {
              setReceivedItems((prev) => [
                {
                  id: createMessageId(),
                  type: "link",
                  content: data.url,
                  timestamp:
                    data.timestamp ||
                    Date.now(),
                },
                ...prev,
              ]);
            }
          } catch (error) {
            console.error(
              "❌ Invalid WebRTC data:",
              error
            );
          }
        }
      );

    const unsubscribeFiles =
      subscribeToWebRTCFiles(
        (data) => {
          if (!data) {
            return;
          }

          // ------------------------------
          // FILE START
          // ------------------------------

          if (data.type === "start") {
            console.log(
              "📥 Receiving file via WebRTC:",
              data.name
            );

            return;
          }

          // ------------------------------
          // FILE PROGRESS
          // ------------------------------

          if (data.type === "progress") {
            console.log(
              `📥 WebRTC receive progress: ${Math.round(
                data.progress
              )}%`
            );

            return;
          }

          // ------------------------------
          // FILE COMPLETE
          // ------------------------------

          if (data.type === "complete") {
            console.log(
              "✅ WebRTC file received:",
              data.name
            );

            setReceivedItems((prev) => [
              {
                id: createMessageId(),
                type: "file",
                file: {
                  originalName: data.name,
                  size: data.size,
                  mimeType: data.mimeType,
                  downloadUrl: data.url,
                  blob: data.blob,
                },
                timestamp: Date.now(),
              },
              ...prev,
            ]);

            return;
          }

          // ------------------------------
          // FILE ERROR
          // ------------------------------

          if (data.type === "error") {
            console.error(
              "❌ WebRTC file receive failed:",
              data.error
            );
          }
        }
      );

    return () => {
      unsubscribeMessages();
      unsubscribeFiles();
    };
  }, []);

  // ==================================================
  // SENT FEEDBACK
  // ==================================================

  const showSent = (type) => {
    setSent(type);

    setTimeout(() => {
      setSent(null);
    }, 1600);
  };

  // ==================================================
  // SEND TEXT
  // ==================================================

  const sendText = () => {
    const value = text.trim();

    if (!value) {
      return;
    }

    const sentViaWebRTC =
      sendWebRTCData({
        type: "text",
        text: value,
        timestamp: Date.now(),
      });

    if (!sentViaWebRTC) {
      console.log(
        "📡 WebRTC unavailable, using Socket.IO fallback"
      );

      socket.emit("send-text", {
        text: value,
      });
    } else {
      console.log(
        "🚀 Text sent directly via WebRTC"
      );
    }

    setText("");

    showSent("text");
    showToast?.("Message sent");
  };

  // ==================================================
  // SEND LINK
  // ==================================================

  const sendLink = () => {
    const value = link.trim();

    if (!value) {
      return;
    }

    const sentViaWebRTC =
      sendWebRTCData({
        type: "link",
        url: value,
        timestamp: Date.now(),
      });

    if (!sentViaWebRTC) {
      console.log(
        "📡 WebRTC unavailable, using Socket.IO fallback"
      );

      socket.emit("send-link", {
        url: value,
      });
    } else {
      console.log(
        "🚀 Link sent directly via WebRTC"
      );
    }

    setLink("");

    showSent("link");
    showToast?.("Link sent");
  };

  // ==================================================
  // FILE SELECT
  // ==================================================

  // ==================================================
// FILE SELECT
// ==================================================

  const handleFileSelect = (event) => {
    const files = Array.from(
      event.target.files || []
    );

    setFileError("");

    if (!files.length) {
      return;
    }

    setSelectedFiles((prev) => [
      ...prev,
      ...files,
    ]);

    // Allow selecting the same file again later
    event.target.value = "";
  };

  // ==================================================
  // DRAG & DROP
  // ==================================================

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (uploading) return;

    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    if (uploading) return;

    const files = Array.from(
      event.dataTransfer.files || []
    );

    if (!files.length) return;

    setFileError("");

    setSelectedFiles((prev) => [
      ...prev,
      ...files,
    ]);
  };
  // ==================================================
  // REMOVE SELECTED FILE
  // ==================================================

  const removeSelectedFile = (index) => {
    if (uploading) {
      return;
    }

    setSelectedFiles((prev) =>
      prev.filter(
        (_, fileIndex) =>
          fileIndex !== index
      )
    );

    setFileError("");
  };

  // ==================================================
  // CLEAR SELECTED FILES
  // ==================================================

  const clearSelectedFiles = () => {
    if (uploading) {
      return;
    }

    setSelectedFiles([]);
    setFileError("");
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ==================================================
  // WEBRTC FILE
  // ==================================================

  const sendSingleFileWebRTC = async (
    file,
    index
  ) => {
    try {
      setCurrentUploadIndex(index);
      setUploadProgress(0);

      console.log(
        "🚀 Trying WebRTC file transfer:",
        file.name
      );

      const sentViaWebRTC =
        await sendFileWebRTC(
          file,
          {
            onStart: () => {
              setCurrentUploadIndex(
                index
              );

              setUploadProgress(0);
            },

            onProgress: (data) => {
              setCurrentUploadIndex(
                index
              );

              setUploadProgress(
                Math.round(
                  data.progress
                )
              );
            },

            onComplete: () => {
              setUploadProgress(100);

              console.log(
                "✅ File sent via WebRTC:",
                file.name
              );
            },

            onError: (error) => {
              console.error(
                "❌ WebRTC file transfer failed:",
                error
              );
            },
          }
        );

      return sentViaWebRTC;
    } catch (error) {
      console.error(
        "❌ WebRTC file transfer error:",
        error
      );

      return false;
    }
  };

  // ==================================================
  // UPLOAD SINGLE FILE
  // ==================================================

  const uploadSingleFile = (
    file,
    index
  ) => {
    return new Promise(
      (resolve, reject) => {
        const formData =
          new FormData();

        formData.append(
          "file",
          file
        );

        formData.append(
          "roomCode",
          roomCode
        );

        formData.append(
          "socketId",
          socket.id
        );

        const xhr =
          new XMLHttpRequest();

        xhr.open(
          "POST",
          `http://${window.location.hostname}:3001/upload`
        );

        xhr.upload.onprogress = (
          event
        ) => {
          if (
            !event.lengthComputable
          ) {
            return;
          }

          const progress =
            Math.round(
              (event.loaded /
                event.total) *
                100
            );

          setCurrentUploadIndex(
            index
          );

          setUploadProgress(
            progress
          );
        };

        xhr.onload = () => {
          if (
            xhr.status < 200 ||
            xhr.status >= 300
          ) {
            reject(
              new Error(
                "File upload failed."
              )
            );

            return;
          }

          let response;

          try {
            response =
              JSON.parse(
                xhr.responseText
              );
          } catch {
            reject(
              new Error(
                "Invalid server response."
              )
            );

            return;
          }

          if (!response.success) {
            reject(
              new Error(
                response.message ||
                  "File upload failed."
              )
            );

            return;
          }

          resolve(response);
        };

        xhr.onerror = () => {
          reject(
            new Error(
              "Could not connect to the server."
            )
          );
        };

        xhr.send(formData);
      }
    );
  };

  // ==================================================
  // UPLOAD FILES
  // ==================================================

  const uploadFiles = async () => {
    if (!selectedFiles.length) {
      return;
    }

    if (!roomCode) {
      setFileError(
        "Room information is missing."
      );

      return;
    }

    if (!socket.id) {
      setFileError(
        "Device connection is not ready."
      );

      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setCurrentUploadIndex(0);
    setFileError("");
    setFailedFiles([]);

    const failed = [];

    for (
      let index = 0;
      index < selectedFiles.length;
      index++
    ) {
      const file =
        selectedFiles[index];

      setCurrentUploadIndex(
        index
      );

      setUploadProgress(0);

      try {
        /*
        ------------------------------------------
        Try WebRTC first
        ------------------------------------------
        */

        const sentViaWebRTC =
          await sendSingleFileWebRTC(
            file,
            index
          );

        /*
        ------------------------------------------
        If WebRTC worked, continue.
        ------------------------------------------
        */

        if (sentViaWebRTC) {
          continue;
        }

        /*
        ------------------------------------------
        WebRTC unavailable/failed.
        Use existing HTTP upload.
        ------------------------------------------
        */

        console.log(
          "📡 WebRTC unavailable, using HTTP fallback:",
          file.name
        );

        await uploadSingleFile(
          file,
          index
        );
      } catch (error) {
        console.error(
          `Upload failed: ${file.name}`,
          error
        );

        failed.push({
          index,
          name: file.name,
          message:
            error.message ||
            "Upload failed.",
        });

        // Continue with the next file
        continue;
      }
    }

    setUploading(false);

    if (failed.length > 0) {
      setFailedFiles(failed);

      setFileError(
        `${failed.length} ${
          failed.length === 1
            ? "file"
            : "files"
        } failed to upload.`
      );

      showToast?.(
        `${failed.length} ${
          failed.length === 1
            ? "file"
            : "files"
        } failed to send`
      );

      return;
    }

    setSelectedFiles([]);
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    showSent("file");
    showToast?.(
      selectedFiles.length === 1
        ? "File sent"
        : `${selectedFiles.length} files sent`
    );
  };

  // ==================================================
  // RETRY FILE
  // ==================================================

  const retryFile = async (
    failedFile
  ) => {
    const file =
      selectedFiles[
        failedFile.index
      ];

    if (!file) {
      return;
    }

    if (!socket.id) {
      setFileError(
        "Device connection is not ready."
      );

      return;
    }

    setFileError("");
    setUploading(true);
    setCurrentUploadIndex(
      failedFile.index
    );
    setUploadProgress(0);

    try {
      /*
      ------------------------------------------
      Try WebRTC again first
      ------------------------------------------
      */

      const sentViaWebRTC =
        await sendSingleFileWebRTC(
          file,
          failedFile.index
        );

      /*
      ------------------------------------------
      HTTP fallback
      ------------------------------------------
      */

      if (!sentViaWebRTC) {
        await uploadSingleFile(
          file,
          failedFile.index
        );
      }

      const remainingFailures =
        failedFiles.filter(
          (item) =>
            item.index !==
            failedFile.index
        );

      setFailedFiles(
        remainingFailures
      );

      if (
        remainingFailures.length ===
        0
      ) {
        setSelectedFiles([]);
        setUploadProgress(0);
        setCurrentUploadIndex(0);

        if (
          fileInputRef.current
        ) {
          fileInputRef.current.value =
            "";
        }

        showSent("file");
        showToast?.("File sent successfully");
      } else {
        showToast?.("File sent");
      }
    } catch (error) {
      console.error(
        `Retry failed: ${file.name}`,
        error
      );

      setFileError(
        `${file.name} could not be uploaded.`
      );

      showToast?.(
        `${file.name} could not be sent`,
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  // ==================================================
  // UI
  // ==================================================

  return (
    <section className="share-section">
      <div className="share-heading">
        <div>
          <span className="room-eyebrow">
            QUICK SHARE
          </span>

          <h2>Send something</h2>
        </div>

        <Clipboard size={20} />
      </div>

      <div className="share-grid">

        {/* TEXT */}

        <div className="share-card">
          <div className="share-card-header">
            <div className="share-icon">
              <Clipboard size={18} />
            </div>

            <div>
              <strong>Text</strong>

              <span>
                Send a message
              </span>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) =>
              setText(
                e.target.value
              )
            }
            placeholder="Paste or type something..."
            rows={4}
          />

          <button
            className="primary-button share-button"
            onClick={sendText}
            disabled={!text.trim()}
          >
            {sent === "text" ? (
              <>
                <Check size={16} />
                Sent
              </>
            ) : (
              <>
                <Send size={16} />
                Send text
              </>
            )}
          </button>
        </div>

        {/* LINK */}

        <div className="share-card">
          <div className="share-card-header">
            <div className="share-icon">
              <LinkIcon size={18} />
            </div>

            <div>
              <strong>Link</strong>

              <span>
                Send a URL
              </span>
            </div>
          </div>

          <input
            value={link}
            onChange={(e) =>
              setLink(
                e.target.value
              )
            }
            placeholder="https://example.com"
            type="url"
          />

          <button
            className="primary-button share-button"
            onClick={sendLink}
            disabled={!link.trim()}
          >
            {sent === "link" ? (
              <>
                <Check size={16} />
                Sent
              </>
            ) : (
              <>
                <Send size={16} />
                Send link
              </>
            )}
          </button>
        </div>

        {/* FILE */}

        <div className="share-card file-share-card">
          <div className="share-card-header">
            <div className="share-icon">
              <File size={18} />
            </div>

            <div>
              <strong>Files</strong>

              <span>
                Send one or multiple files
              </span>
            </div>
          </div>

         <div
            className={`file-dropzone ${
              isDragging ? "file-dropzone-dragging" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="file-dropzone-icon">
              <Upload size={20} />
            </div>

            <div className="file-dropzone-content">
              <strong>Drop files here</strong>
              <span>or choose files from your device</span>
            </div>

            <button
              type="button"
              className="file-choose-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Files
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="file-input-hidden"
            />
          </div>

          {selectedFiles.length >
            0 && (
            <div className="selected-files-list">
              {selectedFiles.map(
                (
                  file,
                  index
                ) => (
                  <div
                    className="selected-file"
                    key={`${file.name}-${file.size}-${index}`}
                  >
                    <div className="selected-file-info">
                      <File size={16} />

                      <div>
                        <strong>
                          {file.name}
                        </strong>

                        <span>
                          {formatFileSize(
                            file.size
                          )}
                        </span>
                      </div>
                    </div>

                    {!uploading && (
                      <button
                        type="button"
                        onClick={() =>
                          removeSelectedFile(
                            index
                          )
                        }
                        aria-label={`Remove ${file.name}`}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {uploading && (
            <div className="upload-queue">
              <div className="upload-progress-top">
                <span>
                  Uploading{" "}
                  {currentUploadIndex +
                    1}{" "}
                  of{" "}
                  {
                    selectedFiles.length
                  }
                </span>

                <span>
                  {uploadProgress}%
                </span>
              </div>

              <div className="upload-current-file">
                {
                  selectedFiles[
                    currentUploadIndex
                  ]?.name
                }
              </div>

              <div className="upload-progress-track">
                <div
                  className="upload-progress-bar"
                  style={{
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>
            </div>
          )}

          {fileError && (
            <div className="form-error">
              <div>
                {fileError}
              </div>

              {failedFiles.length >
                0 && (
                <div className="failed-files-list">
                  {failedFiles.map(
                    (file) => (
                      <div
                        key={`${file.index}-${file.name}`}
                        className="failed-file"
                      >
                        <div className="failed-file-info">
                          <span>
                            {file.name}
                          </span>

                          <span>
                            {file.message}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="retry-file-button"
                          onClick={() =>
                            retryFile(
                              file
                            )
                          }
                          disabled={
                            uploading
                          }
                        >
                          Retry
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          <button
            className="primary-button share-button"
            onClick={uploadFiles}
            disabled={
              !selectedFiles.length ||
              uploading
            }
          >
            {sent === "file" ? (
              <>
                <Check size={16} />
                Sent
              </>
            ) : uploading ? (
              <>
                <Upload
                  size={16}
                  className="spin"
                />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Send{" "}
                {selectedFiles.length >
                1
                  ? `${selectedFiles.length} files`
                  : "file"}
              </>
            )}
          </button>

          {selectedFiles.length >
            0 &&
            !uploading && (
              <button
                type="button"
                className="clear-files-button"
                onClick={
                  clearSelectedFiles
                }
              >
                Clear all
              </button>
            )}
        </div>
      </div>

      {/* RECEIVED */}

      {receivedItems.length > 0 && (
        <div className="received-section">
          <div className="share-heading">
            <div>
              <span className="room-eyebrow">
                RECEIVED
              </span>

              <h2>
                From your other devices
              </h2>
            </div>
          </div>

          <div className="received-list">
            {receivedItems.map(
              (item) => (
                <div
                  className="received-item"
                  key={item.id}
                >
                  <div className="received-item-icon">
                    {item.type ===
                    "text" ? (
                      <Clipboard
                        size={16}
                      />
                    ) : item.type ===
                      "link" ? (
                      <LinkIcon
                        size={16}
                      />
                    ) : (
                      <File
                        size={16}
                      />
                    )}
                  </div>

                  <div className="received-item-content">
                    <span>
                      {item.type ===
                      "text"
                        ? "Text"
                        : item.type ===
                          "link"
                        ? "Link"
                        : "File"}
                    </span>

                    {item.type ===
                    "link" ? (
                      <a
                        href={
                          item.content
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {
                          item.content
                        }
                      </a>
                    ) : item.type ===
                      "text" ? (
                      <p>
                        {item.content}
                      </p>
                    ) : (
                      <div className="received-file">
                        {item.file.mimeType?.startsWith(
                          "image/"
                        ) && (
                          <div className="received-image-preview">
                            <img
                              src={
                                item.file.blob
                                  ? item.file.downloadUrl
                                  : `http://${window.location.hostname}:3001${item.file.downloadUrl}`
                              }
                              alt={
                                item.file
                                  .originalName
                              }
                            />
                          </div>
                        )}

                        <div className="received-file-details">
                          <div>
                            <strong>
                              {
                                item
                                  .file
                                  .originalName
                              }
                            </strong>

                            <span>
                              {formatFileSize(
                                item
                                  .file
                                  .size
                              )}
                            </span>
                          </div>

                          <a
                            href={
                              item.file
                                .blob
                                ? item.file
                                    .downloadUrl
                                : `http://${window.location.hostname}:3001${item.file.downloadUrl}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            download={
                              item.file
                                .originalName
                            }
                          >
                            <Download
                              size={15}
                            />
                            Download
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default SharePanel;