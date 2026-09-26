const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

export function createPeerConnection({
  onIceCandidate,
  onDataChannel,
  onConnectionStateChange,
}) {
  const peer = new RTCPeerConnection(
    ICE_SERVERS
  );

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate?.(event.candidate);
    }
  };

  peer.ondatachannel = (event) => {
    onDataChannel?.(event.channel);
  };

  peer.onconnectionstatechange = () => {
  console.log(
    "🔗 WebRTC connection state:",
    peer.connectionState
  );

  onConnectionStateChange?.(
    peer.connectionState
  );
};

peer.oniceconnectionstatechange = () => {
  console.log(
    "🧊 ICE connection state:",
    peer.iceConnectionState
  );
};

peer.onicegatheringstatechange = () => {
  console.log(
    "🧊 ICE gathering state:",
    peer.iceGatheringState
  );
};

peer.onsignalingstatechange = () => {
  console.log(
    "📡 Signaling state:",
    peer.signalingState
  );
};

  return peer;
}