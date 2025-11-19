const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// --- USERS WAITING FOR A PARTNER ---
let waiting = [];

// --- Helper: create unique room ID ---
function makeRoomId() {
  return "room-" + Math.random().toString(36).substr(2, 9);
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // user clicked "start"
  socket.on("start", () => {
    // remove from queue if already
    waiting = waiting.filter(id => id !== socket.id);

    if (waiting.length === 0) {
      waiting.push(socket.id);
      socket.emit("waiting");
      console.log(socket.id, "waiting");
    } else {
      const partner = waiting.shift();
      const room = makeRoomId();

      socket.join(room);
      io.sockets.sockets.get(partner)?.join(room);

      io.to(room).emit("matched", { room });

      console.log("Room created:", room);
      console.log("Users:", socket.id, partner);
    }
  });

  // user sending text message
  socket.on("msg", (data) => {
    io.to(data.room).emit("msg", { from: socket.id, text: data.text });
  });

  // user sending WebRTC offer (video chat)
  socket.on("offer", (data) => {
    socket.to(data.room).emit("offer", data.offer);
  });

  // user sending WebRTC answer (video chat)
  socket.on("answer", (data) => {
    socket.to(data.room).emit("answer", data.answer);
  });

  // ICE candidates
  socket.on("candidate", (data) => {
    socket.to(data.room).emit("candidate", data.candidate);
  });

  // user clicks "next"
  socket.on("next", () => {
    kickFromAllRooms(socket);
    socket.emit("start");
  });

  // user disconnect
  socket.on("disconnect", () => {
    waiting = waiting.filter(id => id !== socket.id);
    kickFromAllRooms(socket);
    console.log("Disconnected:", socket.id);
  });
});

// --- Remove user from all rooms and notify partner ---
function kickFromAllRooms(socket) {
  const rooms = [...socket.rooms].filter(r => r !== socket.id);
  rooms.forEach(room => {
    socket.leave(room);
    socket.to(room).emit("partner-left");
  });
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log("Omegle Clone Server Running at http://localhost:" + PORT);
});
