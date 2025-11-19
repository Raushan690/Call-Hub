const socket = io();

// DOM elements
const statusBox = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const stopBtn = document.getElementById("stopBtn");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let currentRoom = null;
let pc = null; // WebRTC peer connection
let localStream = null;

// ================================================
// UI HELPERS
// ================================================
function appendSystem(text) {
  const div = document.createElement("div");
  div.className = "sys";
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function appendMessage(who, text) {
  const div = document.createElement("div");
  div.className = who === "me" ? "msg me" : "msg partner";
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// ================================================
// START CHAT
// ================================================
startBtn.onclick = () => {
  socket.emit("start");
  startBtn.disabled = true;
  nextBtn.disabled = true;
  stopBtn.disabled = false;
  statusBox.textContent = "Searching for partner...";
};

// NEXT / SKIP
nextBtn.onclick = () => {
  socket.emit("next");
  statusBox.textContent = "Searching for new partner...";
  messages.innerHTML = "";
  stopVideo();
};

// STOP
stopBtn.onclick = () => {
  socket.emit("next");
  statusBox.textContent = "Stopped. Click Start to begin again.";
  resetButtons();
  messages.innerHTML = "";
  stopVideo();
};

// Reset UI Buttons
function resetButtons() {
  startBtn.disabled = false;
  nextBtn.disabled = true;
  sendBtn.disabled = true;
  stopBtn.disabled = true;
}

// ================================================
// TEXT CHAT
// ================================================
sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text || !currentRoom) return;

  socket.emit("msg", { room: currentRoom, text });
  appendMessage("me", text);
  msgInput.value = "";
};

// incoming text
socket.on("msg", (data) => {
  if (data.from !== socket.id) {
    appendMessage("partner", data.text);
  }
});

// ================================================
// MATCHING EVENTS
// ================================================
socket.on("waiting", () => {
  statusBox.textContent = "Waiting for partner...";
  appendSystem("You are waiting for someone...");
});

socket.on("matched", async ({ room }) => {
  currentRoom = room;
  statusBox.textContent = "Connected!";
  appendSystem("You are now connected.");

  nextBtn.disabled = false;
  sendBtn.disabled = false;

  await startVideo();
  startWebRTC(room);
});

socket.on("partner-left", () => {
  appendSystem("Partner disconnected.");
  statusBox.textContent = "Partner left. Click Next to find new one.";
  remoteVideo.srcObject = null;
  nextBtn.disabled = false;
});

// ================================================
// VIDEO CHAT (WEBRTC)
// ================================================
async function startVideo() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;
}

// Stop local video stream
function stopVideo() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  if (pc) {
    pc.close();
    pc = null;
  }
}

// WebRTC setup
function startWebRTC(room) {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302"] }
    ]
  });

  // Add local video/audio tracks
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // When remote stream arrives
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", { room, candidate: event.candidate });
    }
  };

  // Create offer if needed
  if (pc.signalingState === "stable") {
    createOffer(room);
  }

  // Listen for incoming offers/answers
  socket.on("offer", async (offer) => {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { room, answer });
  });

  socket.on("answer", async (answer) => {
    await pc.setRemoteDescription(answer);
  });

  socket.on("candidate", async (candidate) => {
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {}
  });
}

// Create WebRTC offer
async function createOffer(room) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer", { room, offer });
}
