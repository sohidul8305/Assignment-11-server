const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const user = process.env.DB_USER;
const pass = encodeURIComponent(process.env.DB_PASS);
const host = process.env.DB_HOST;
const dbName = process.env.DB_NAME || "loanDB";

const uri = `mongodb+srv://${user}:${pass}@${host}/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1 }
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(dbName);
    const loanCollection = db.collection("loans");

    // POST /loan-applications → add new loan
    app.post('/loan-applications', async (req, res) => {
      try {
        const body = req.body;
        const applicationData = {
          ...body,
          status: "Pending",
          feeStatus: "unpaid",
          applicationDate: new Date().toISOString()
        };
        const result = await loanCollection.insertOne(applicationData);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ success: false, error: err.message });
      }
    });

    // GET /loans → fetch loans filtered by userEmail + optional limit
    app.get('/loans', async (req, res) => {
      try {
        const { userEmail, limit } = req.query;
        const query = {};
        if (userEmail) query.userEmail = userEmail;

        let cursor = loanCollection.find(query);
        if (limit) cursor = cursor.limit(parseInt(limit));

        const loans = await cursor.toArray();
        res.send(loans);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server Error" });
      }
    });

    // GET /loans/:id → fetch single loan by ID
    app.get('/loans/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
        if (!loan) return res.status(404).send({ message: "Loan not found" });
        res.send(loan);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

  } catch (err) {
    console.error("❌ DB Error:", err);
  }
}

run();

// Root route
app.get('/', (req, res) => {
  res.send("Loan Server Running 🚀");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
