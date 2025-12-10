const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.uri; // e.g., mongodb+srv://user:pass@cluster.mongodb.net/ticket_booking_platform
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("MongoDB Connected Successfully!");

    const db = client.db("ticket_booking_platform");
    const usersCollection = db.collection("users");
    const ticketsCollection = db.collection("tickets");
    const bookingsCollection = db.collection("bookings");
    const transactionsCollection = db.collection("transactions");

    /* ---------------------- USERS ---------------------- */

    // Add new user
    app.post("/users", async (req, res) => {
      try {
        const { name, email, password, role } = req.body;
        const newUser = {
          name,
          email,
          password,
          role: role || "USER",
          fraud: false,
          createdAt: new Date(),
        };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: "User created", user: newUser, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.json(users);
    });

    // Update user
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
      const updateData = req.body;
      const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "User updated", result });
    });

    /* ---------------------- TICKETS ---------------------- */

    // Add ticket
    app.post("/tickets", async (req, res) => {
      try {
        console.log("Ticket Received:", req.body);

        const departureDateTime = new Date(`${req.body.departureDate}T${req.body.departureTime}`);

        const ticketData = {
          ...req.body,
          price: Number(req.body.price),
          quantity: Number(req.body.quantity),
          departureDateTime,
          createdAt: new Date(),
          verificationStatus: "pending",
          advertise: false,
        };

        const result = await ticketsCollection.insertOne(ticketData);
        console.log("Inserted Ticket:", ticketData);

        res.status(201).json({ message: "Ticket added", ticket: ticketData, ticketId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    // Get all approved tickets
    app.get("/tickets", async (req, res) => {
      const query = { verificationStatus: "approved" };
      if (req.query.advertised === "true") query.advertise = true;
      const tickets = await ticketsCollection.find(query).toArray();
      res.json(tickets);
    });

    // Get ticket by id
    app.get("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Ticket ID" });
      const ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
      res.json(ticket);
    });

    // Get tickets by vendor
    app.get("/tickets/vendor/:email", async (req, res) => {
      const email = req.params.email;
      const tickets = await ticketsCollection.find({ vendorEmail: email }).toArray();
      res.json(tickets);
    });

    // Update ticket
    app.patch("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Ticket ID" });
      const updateData = req.body;
      const result = await ticketsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "Ticket updated", result });
    });

    // Delete ticket
    app.delete("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Ticket ID" });
      const result = await ticketsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ message: "Ticket deleted", result });
    });

    /* ---------------------- BOOKINGS ---------------------- */

    app.post("/bookings", async (req, res) => {
      try {
        const booking = { ...req.body, status: "pending", createdAt: new Date() };
        const result = await bookingsCollection.insertOne(booking);
        res.status(201).json({ message: "Booking created", booking, bookingId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/bookings/user/:email", async (req, res) => {
      const email = req.params.email;
      const bookings = await bookingsCollection.find({ userEmail: email }).toArray();
      res.json(bookings);
    });

    app.get("/bookings/vendor/:email", async (req, res) => {
      const email = req.params.email;
      const bookings = await bookingsCollection.find({ vendorEmail: email }).toArray();
      res.json(bookings);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Booking ID" });
      const updateData = req.body;
      const result = await bookingsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "Booking updated", result });
    });

    /* ---------------------- TRANSACTIONS ---------------------- */

    app.post("/transactions", async (req, res) => {
      try {
        const transaction = { ...req.body, createdAt: new Date() };
        const result = await transactionsCollection.insertOne(transaction);
        res.status(201).json({ message: "Transaction saved", transaction, transactionId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/transactions/user/:email", async (req, res) => {
      const email = req.params.email;
      const transactions = await transactionsCollection.find({ userEmail: email }).toArray();
      res.json(transactions);
    });

    /* ---------------------- SERVER START ---------------------- */

    app.listen(port, () => console.log(`Booking Server running on port ${port}`));

  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run();
