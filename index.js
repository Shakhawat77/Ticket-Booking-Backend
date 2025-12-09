const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.3lozw5z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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
    const ticketCollection = db.collection("tickets");
    const bookingsCollection = db.collection("bookings"); // for user bookings
    const transactionsCollection = db.collection("transactions"); // for payments

    /*** Users ***/
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
        res.status(201).json({ message: "User created successfully", user: newUser, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.json(users);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "User updated", result });
    });

    /*** Tickets ***/
    app.post("/tickets", async (req, res) => {
      try {
        const { title, from, to, transportType, price, quantity, dateTime, perks, image, vendorName, vendorEmail } = req.body;
        const newTicket = {
          title,
          from,
          to,
          transportType,
          price: Number(price),
          quantity: Number(quantity),
          departureDateTime: new Date(dateTime),
          perks: perks || [],
          image: image || "",
          vendorName: vendorName || "",
          vendorEmail: vendorEmail || "",
          verificationStatus: "pending",
          advertise: false,
          createdAt: new Date(),
        };
        const result = await ticketCollection.insertOne(newTicket);
        res.status(201).json({ message: "Ticket added", ticket: newTicket, ticketId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    app.get("/tickets", async (req, res) => {
      const tickets = await ticketCollection.find({ verificationStatus: "approved" }).toArray();
      res.json(tickets);
    });

    app.get("/tickets/vendor/:email", async (req, res) => {
      const email = req.params.email;
      const tickets = await ticketCollection.find({ vendorEmail: email }).toArray();
      res.json(tickets);
    });

    app.get("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const ticket = await ticketCollection.findOne({ _id: new ObjectId(id) });
      res.json(ticket);
    });

    app.patch("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const result = await ticketCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "Ticket updated", result });
    });

    app.delete("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ticketCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ message: "Ticket deleted", result });
    });

    /*** Bookings ***/
    app.post("/bookings", async (req, res) => {
      const booking = {
        ...req.body,
        status: "pending",
        createdAt: new Date(),
      };
      const result = await bookingsCollection.insertOne(booking);
      res.status(201).json({ message: "Booking created", booking, bookingId: result.insertedId });
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
      const updateData = req.body;
      const result = await bookingsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.json({ message: "Booking updated", result });
    });

    /*** Transactions ***/
    app.post("/transactions", async (req, res) => {
      const transaction = {
        ...req.body,
        createdAt: new Date(),
      };
      const result = await transactionsCollection.insertOne(transaction);
      res.status(201).json({ message: "Transaction saved", transaction, transactionId: result.insertedId });
    });

    app.get("/transactions/user/:email", async (req, res) => {
      const email = req.params.email;
      const transactions = await transactionsCollection.find({ userEmail: email }).toArray();
      res.json(transactions);
    });

    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run();
