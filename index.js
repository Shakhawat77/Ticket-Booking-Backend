// server.js
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Collections (initialized after DB connect)
let usersCollection;
let ticketsCollection;
let bookingsCollection;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.uri;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
});

// JWT Middleware
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = decoded; // { email, role }
    next();
  });
}

// Connect to MongoDB and initialize collections
async function connectDB() {
  try {
    await client.connect();
    console.log("🟢 MongoDB Connected!");
    const db = client.db("ticket_booking_platform");
    usersCollection = db.collection("users");
    ticketsCollection = db.collection("tickets");
    bookingsCollection = db.collection("bookings");
  } catch (err) {
    console.error("🔴 MongoDB Connection Error:", err);
  }
}

// Helper to check DB readiness
function checkDBReady(res) {
  if (!usersCollection || !ticketsCollection || !bookingsCollection) {
    res.status(503).json({ message: "Database connecting. Try again shortly." });
    return false;
  }
  return true;
}

/* ---------------------- BASE ---------------------- */
app.get("/", (req, res) => res.send("Ticket Booking Server running"));

/* ---------------------- JWT ---------------------- */
app.get("/jwt", async (req, res) => {
  if (!checkDBReady(res)) return;

  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email required" });

  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.json({ token });
});

/* ---------------------- USERS ---------------------- */
// Create user
app.post("/users", async (req, res) => {
  if (!checkDBReady(res)) return;
  const { name, email, password, role } = req.body;
  if (!email) return res.status(400).json({ message: "Email required" });

  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) return res.status(400).json({ message: "User already exists" });

  const newUser = { name: name || "User", email, password: password || null, role: role || "USER", fraud: false, createdAt: new Date() };
  const result = await usersCollection.insertOne(newUser);

  res.status(201).json({ message: "User created", userId: result.insertedId, user: newUser });
});

// Google login
app.post("/users/google-login", async (req, res) => {
  if (!checkDBReady(res)) return;
  const { name, email, photoURL } = req.body;
  if (!email) return res.status(400).json({ message: "Email required" });

  let user = await usersCollection.findOne({ email });
  if (!user) {
    user = { name, email, photoURL, role: "USER", fraud: false, createdAt: new Date() };
    await usersCollection.insertOne(user);
  }

  const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.json({ token });
});

// Get all users (Admin only)
app.get("/users", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

  const users = await usersCollection.find({}).toArray();
  res.json(users);
});

// Update user role/fraud (Admin only)
app.patch("/users/:id", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });

  const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
  res.json({ message: "User updated", result });
});

// **New endpoint**: Get user by email (for role fetching)
app.get("/users/email/:email", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;

  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({ role: user.role });
});

/* ---------------------- TICKETS ---------------------- */
// Add ticket (Vendor only)
app.post("/tickets", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  if (req.user.role !== "VENDOR") return res.status(403).json({ message: "Only vendor can add tickets" });

  const { title, from, to, transportType, price, quantity, departureDate, departureTime, perks, image } = req.body;
  const departureDateTime = new Date(`${departureDate}T${departureTime}`);
  const ticket = { title, from, to, transportType, price: Number(price), quantity: Number(quantity), departureDateTime, perks: perks || {}, image: image || "", vendorEmail: req.user.email, verificationStatus: "pending", advertise: false, createdAt: new Date() };

  await ticketsCollection.insertOne(ticket);
  res.status(201).json({ message: "Ticket added", ticket });
});

// Get tickets
app.get("/tickets", async (req, res) => {
  if (!checkDBReady(res)) return;
  const status = req.query.verificationStatus || "approved";
  const query = { verificationStatus: status };
  if (req.query.advertised === "true") query.advertise = true;

  const tickets = await ticketsCollection.find(query).toArray();
  res.json(tickets);
});

// Get ticket by ID
app.get("/tickets/:id", async (req, res) => {
  if (!checkDBReady(res)) return;
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Ticket ID" });

  const ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  res.json(ticket);
});

// Update ticket (Vendor only)
app.patch("/tickets/:id", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Ticket ID" });

  const ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  if (req.user.role !== "VENDOR" || ticket.vendorEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  const result = await ticketsCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
  res.json({ message: "Ticket updated", result });
});

// Delete ticket (Vendor only)
app.delete("/tickets/:id", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Ticket ID" });

  const ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  if (req.user.role !== "VENDOR" || ticket.vendorEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  const result = await ticketsCollection.deleteOne({ _id: new ObjectId(id) });
  res.json({ message: "Ticket deleted", result });
});

/* ---------------------- BOOKINGS ---------------------- */
// Add booking
app.post("/bookings", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  const booking = { ...req.body, userEmail: req.user.email, status: "pending", createdAt: new Date() };
  await bookingsCollection.insertOne(booking);
  res.status(201).json({ message: "Booking created", booking });
});

// Get user bookings
app.get("/bookings/user", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  const bookings = await bookingsCollection.find({ userEmail: req.user.email }).toArray();
  res.json(bookings);
});

// Get vendor bookings
app.get("/bookings/vendor", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  if (req.user.role !== "VENDOR") return res.status(403).json({ message: "Forbidden" });
  const bookings = await bookingsCollection.find({ vendorEmail: req.user.email }).toArray();
  res.json(bookings);
});

// Update booking (Vendor/Admin)
app.patch("/bookings/:id", verifyJWT, async (req, res) => {
  if (!checkDBReady(res)) return;
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Booking ID" });

  const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (req.user.role !== "VENDOR" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

  const result = await bookingsCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
  res.json({ message: "Booking updated", result });
});

/* ---------------------- START SERVER ---------------------- */
app.listen(port, () => {
  console.log(`📡 Server listening on port ${port}`);
  connectDB();
});
