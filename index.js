const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
const user = process.env.DB_USER;
const pass = encodeURIComponent(process.env.DB_PASS); 
const host = process.env.DB_HOST; 
const dbName = process.env.DB_NAME || "loanDB";

const uri = `mongodb+srv://${user}:${pass}@${host}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(dbName);
    const loanCollection = db.collection("loans");

    // POST /loans - Add new loan
    app.post('/loans', async (req, res) => {
      try {
        const result = await loanCollection.insertOne(req.body);
        res.send({
          success: true,
          message: "Loan added successfully",
          insertedId: result.insertedId
        });
      } catch (err) {
        res.status(500).send({ success: false, error: err.message });
      }
    });

    // GET /loans?limit=6
app.get('/loans', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0; 
    const loans = await loanCollection.find({}).limit(limit).toArray();
    res.send(loans);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


app.get('/loans', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0;

    const loans = await loanCollection
      .find({})
      .limit(limit)
      .toArray();

    res.send(loans);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// all loans load data
app.get('/loans/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { ObjectId } = require('mongodb');
    const loan = await loanCollection.findOne({ _id: new ObjectId(id) });

    if (!loan) {
      return res.status(404).send({ message: "Loan not found" });
    }

    res.send(loan);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


// GET loan by ID
app.get('/loans/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const id = req.params.id;

    const loan = await loanCollection.findOne({ _id: new ObjectId(id) });

    if (!loan) return res.status(404).send({ message: "Loan not found" });

    res.send(loan);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});




    // GET /loans (with optional limit)
    app.get('/loans', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit);   // ?limit=6 হলে 6 নেবে
        let cursor = loanCollection.find({});

        if (limit) {
          cursor = cursor.limit(limit);
        }

        const loans = await cursor.toArray();
        res.send(loans);

      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

  } catch (err) {
    console.error("❌ DB Error:", err);
  }
}

run();

// Root route
app.get('/', (req, res) => {
  res.send('Loan Server Running 🚀');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
