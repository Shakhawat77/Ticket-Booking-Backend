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
  serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
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

/* ---------------- AUTH HELPERS ---------------- */
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = decoded;
    next();
  });
}

const verifyAdmin = (req, res, next) =>
  req.user.role === "ADMIN" ? next() : res.status(403).json({ message: "Admin only" });

const verifyVendor = (req, res, next) =>
  req.user.role === "VENDOR" ? next() : res.status(403).json({ message: "Vendor only" });

/* ---------------- ROOT ---------------- */
app.get("/", (req, res) => res.send("Ticket Booking Server Running"));

/* ---------------- JWT ---------------- */
app.get("/jwt", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email required" });

  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  res.json({ token });
});

/* ---------------- USERS ---------------- */
app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  const exists = await usersCollection.findOne({ email });
  if (exists) return res.json(exists);

  const user = { name, email, role: "USER", isFraud: false, createdAt: new Date() };
  await usersCollection.insertOne(user);
  res.json(user);
});

app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
  const users = await usersCollection.find({}).toArray();
  res.json(users);
});

app.get("/users/email/:email", verifyJWT, async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ role: user.role });
});

app.patch("/users/role/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const { role } = req.body;
  if (!["ADMIN", "VENDOR", "USER"].includes(role)) return res.status(400).json({ message: "Invalid role" });

  await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role } });
  res.json({ message: "Role updated" });
});

app.patch("/users/fraud/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const user = await usersCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!user || user.role !== "VENDOR") return res.status(400).json({ message: "Invalid vendor" });

  await usersCollection.updateOne({ _id: user._id }, { $set: { isFraud: true } });
  await ticketsCollection.updateMany({ vendorEmail: user.email }, { $set: { isHidden: true } });

  res.json({ message: "Vendor marked as fraud" });
});

/* ---------------- TICKETS ---------------- */
// Public tickets
app.get("/tickets", async (req, res) => {
  const query = { verificationStatus: "approved", isHidden: { $ne: true } };
  if (req.query.advertised === "true") query.isAdvertised = true;

  const tickets = await ticketsCollection.find(query).toArray();
  res.json(tickets);
});

// Admin fetch all approved tickets (for AdvertiseTickets page)
app.get("/tickets/admin/approved", verifyJWT, verifyAdmin, async (req, res) => {
  const tickets = await ticketsCollection.find({ verificationStatus: "approved" }).toArray();
  res.json(tickets);
});

// Vendor create ticket
app.post("/tickets", verifyJWT, verifyVendor, async (req, res) => {
  const vendor = await usersCollection.findOne({ email: req.user.email });
  if (vendor.isFraud) return res.status(403).json({ message: "Fraud vendor blocked" });

  const ticket = {
    ...req.body,
    vendorEmail: req.user.email,
    verificationStatus: "pending",
    isAdvertised: false,
    isHidden: false,
    createdAt: new Date(),
  };

  await ticketsCollection.insertOne(ticket);
  res.json(ticket);
});

// Vendor routes
app.get("/vendor/tickets", verifyJWT, verifyVendor, async (req, res) => {
  const tickets = await ticketsCollection.find({ vendorEmail: req.user.email }).toArray();
  res.json(tickets);
});

app.patch("/tickets/vendor/:id", verifyJWT, verifyVendor, async (req, res) => {
  const ticket = await ticketsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!ticket || ticket.vendorEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  await ticketsCollection.updateOne({ _id: ticket._id }, { $set: req.body });
  res.json({ message: "Ticket updated" });
});

app.delete("/tickets/vendor/:id", verifyJWT, verifyVendor, async (req, res) => {
  const ticket = await ticketsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!ticket || ticket.vendorEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  await ticketsCollection.deleteOne({ _id: ticket._id });
  res.json({ message: "Ticket deleted" });
});

// Admin manage tickets
app.get("/admin/tickets", verifyJWT, verifyAdmin, async (req, res) => {
  const tickets = await ticketsCollection.find({}).toArray();
  res.json(tickets);
});

app.patch("/admin/tickets/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const { verificationStatus } = req.body;
  if (!["approved", "rejected"].includes(verificationStatus)) return res.status(400).json({ message: "Invalid status" });

  await ticketsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { verificationStatus } });
  res.json({ message: "Ticket status updated" });
});

// Advertise / Unadvertise route
app.patch("/tickets/advertise/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const { isAdvertised } = req.body;
  if (typeof isAdvertised !== "boolean") return res.status(400).json({ message: "Invalid value" });

  if (isAdvertised) {
    const count = await ticketsCollection.countDocuments({ isAdvertised: true });
    if (count >= 6) return res.status(400).json({ message: "Maximum 6 advertised tickets allowed" });
  }

  await ticketsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { isAdvertised } });
  res.json({ message: "Advertisement status updated" });
});

/* ---------------- BOOKINGS ---------------- */
app.get("/bookings/vendor", verifyJWT, verifyVendor, async (req, res) => {
  const bookings = await bookingsCollection.find({ vendorEmail: req.user.email }).toArray();
  res.json(bookings);
});

app.patch("/bookings/accepted/:id", verifyJWT, verifyVendor, async (req, res) => {
  await bookingsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "accepted" } });
  res.json({ message: "Booking accepted" });
});

app.patch("/bookings/rejected/:id", verifyJWT, verifyVendor, async (req, res) => {
  await bookingsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "rejected" } });
  res.json({ message: "Booking rejected" });
});

/* ---------------- START SERVER ---------------- */
app.listen(port, async () => {
  await connectDB();
  console.log(`🚀 Server running on port ${port}`);
});
