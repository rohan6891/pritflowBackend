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
    origin: "*", // Adjust to match your frontend port
    methods: ["GET", "POST","PUT"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// DB connection
mongoose.connect(MONGO_URL)
  .then(() => console.log("Successfully connected to MongoDB.."))
  .catch((err) => console.log(err));

// Set socket.io instance in app
app.set("socketio", io);

// Routes
app.use('/api/shop', shopRoutes);
app.use('/api/printjobs', printJobRoutes);
app.use('/api/upload', uploadRoutes);

// WebSocket connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
  
  // Add room joining logic
  socket.on("joinShopRoom", (shopId) => {
    socket.join(`shop_${shopId}`);
    console.log(`Socket ${socket.id} joined room: shop_${shopId}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server successfully running at port: ${PORT}`);
});