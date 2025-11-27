const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
});

const PORT = process.env.PORT || 3000;

// Matchmaking queue
let waiting = null;
const rooms = {};

function makeRoomId(a, b) {
  return [a, b].sort().join('#');
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", () => {
    console.log("Join request:", socket.id);

    if (waiting && waiting !== socket.id) {
      // Match users
      const roomId = makeRoomId(waiting, socket.id);
      rooms[roomId] = { a: waiting, b: socket.id };

      io.to(waiting).emit("matched", { roomId, partner: socket.id });
      io.to(socket.id).emit("matched", { roomId, partner: waiting });

      waiting = null;
    } else {
      waiting = socket.id;
      socket.emit("waiting");
    }
  });

  socket.on("signal", ({ roomId, to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    const other = room.a === socket.id ? room.b : room.a;
    io.to(other).emit("chat-message", { from: socket.id, message });
  });

  socket.on("skip", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const other = room.a === socket.id ? room.b : room.a;

    io.to(other).emit("partner-skipped");

    delete rooms[roomId];

    waiting = socket.id;
    socket.emit("waiting");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (waiting === socket.id) waiting = null;

    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.a === socket.id || room.b === socket.id) {
        const other = room.a === socket.id ? room.b : room.a;
        io.to(other).emit("partner-disconnected");
        delete rooms[roomId];
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("Omegle backend server running!");
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
