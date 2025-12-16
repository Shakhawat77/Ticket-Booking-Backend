/* ---------------- BACKEND: server.js ---------------- */

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors());
app.use(express.json());

/* ---------------- DATABASE ---------------- */
const uri = process.env.uri;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
});

let usersCollection;
let ticketsCollection;
let bookingsCollection;

async function connectDB() {
  await client.connect();
  const db = client.db("ticket_booking_platform");
  usersCollection = db.collection("users");
  ticketsCollection = db.collection("tickets");
  bookingsCollection = db.collection("bookings");
  console.log("🟢 MongoDB Connected");
}

/* ---------------- JWT VERIFICATION ---------------- */
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

/* ---------------- ROOT ---------------- */
app.get("/", (req, res) => {
  res.send("Ticket Booking Server Running");
});

/* ---------------- AUTH / JWT ---------------- */
app.get("/jwt", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email required" });

  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const token = jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token });
});

/* ---------------- USERS ---------------- */

// Add new user
app.post("/users", async (req, res) => {
  const { name, email, role } = req.body;

  const exists = await usersCollection.findOne({ email });
  if (exists) return res.json(exists);

  const user = {
    name,
    email,
    role: role?.toUpperCase() || "USER",
    isFraud: false,
    createdAt: new Date(),
  };

  await usersCollection.insertOne(user);
  res.json(user);
});

// Get all users (admin purpose)
app.get("/users", verifyJWT, async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Get user by email
app.get("/users/email/:email", verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});
/* ---------------- TICKETS ---------------- */

// Public – approved tickets
app.get("/tickets", async (req, res) => {
  try {
    const query = { verificationStatus: "approved" };
    if (req.query.advertised === "true") query.isAdvertised = true;

    const tickets = await ticketsCollection.find(query).toArray();
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
});

// Vendor – all tickets of logged-in vendor
app.get("/vendor/tickets", verifyJWT, async (req, res) => {
  if (req.user.role !== "VENDOR")
    return res.status(403).json({ message: "Forbidden" });

  try {
    const tickets = await ticketsCollection
      .find({ vendorEmail: req.user.email })
      .toArray();
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch vendor tickets" });
  }
});

/* ---------------- BOOKINGS ---------------- */

// Vendor – requested bookings for their tickets
app.get("/bookings/vendor", verifyJWT, async (req, res) => {
  if (req.user.role !== "VENDOR")
    return res.status(403).json({ message: "Forbidden" });

  try {
    const bookings = await bookingsCollection
      .find({ vendorEmail: req.user.email })
      .toArray();
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

// Accept booking
app.patch("/bookings/accepted/:id", verifyJWT, async (req, res) => {
  if (req.user.role !== "VENDOR")
    return res.status(403).json({ message: "Forbidden" });

  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Booking ID" });

  try {
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.vendorEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden" });

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "accepted" } }
    );

    res.json({ message: "Booking accepted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to accept booking" });
  }
});

// Reject booking
app.patch("/bookings/rejected/:id", verifyJWT, async (req, res) => {
  if (req.user.role !== "VENDOR")
    return res.status(403).json({ message: "Forbidden" });

  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Booking ID" });

  try {
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.vendorEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden" });

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "rejected" } }
    );

    res.json({ message: "Booking rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to reject booking" });
  }
});

/* ---------------- START SERVER ---------------- */
app.listen(port, async () => {
  await connectDB();
  console.log(`🚀 Server running on port ${port}`);
});
