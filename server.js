const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");

const { MONGO_URL, PORT } = require("./config");

const shopRoutes = require('./routes/shop');
const printJobRoutes = require('./routes/printjobs'); // Note: Rename if needed to avoid confusion
const uploadRoutes = require('./routes/upload');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST','PUT','DELETE']
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// DB connection
mongoose.connect(MONGO_URL)
  .then(() => console.log("Successfully connected to MongoDB.."))
  .catch((err) => console.log(err));

// Set socket.io instance in app
app.set("socketio", io);

// Add this root level health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Routes
app.use('/api/shop', shopRoutes);
app.use('/api/printjobs', printJobRoutes);
app.use('/api/upload', uploadRoutes);

// WebSocket connection
io.on("connection", (socket) => {
  const origin = socket.handshake.headers.origin;

  // Validate the Origin header
  if (origin !== process.env.FRONTEND_URL) {
    console.log(`Connection rejected: Invalid origin ${origin}`);
    socket.disconnect(true); // Disconnect the client
    return;
  }

  console.log(`Client connected: ${socket.id}`);

  // Handle shop room joining
  socket.on('joinShopRoom', (shopId) => {
    if (shopId) {
      const roomName = `shop_${shopId}`;
      socket.join(roomName);
      console.log(`Client ${socket.id} joined room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server successfully running at port: ${PORT}`);
});