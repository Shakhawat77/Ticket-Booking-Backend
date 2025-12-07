const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.3lozw5z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = "mongodb+srv://ticket_booking_platform:zqSiYKI7CwB5O2pu@cluster0.3lozw5z.mongodb.net/?appName=Cluster0";
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
    const userCollection = db.collection("users");
   

    
    app.listen(port, () =>
      console.log(`Server running on port ${port}`)
    );
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run();
