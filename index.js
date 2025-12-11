const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const stripe = require('stripe')(process.env.ATRIPE_SECRET);


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
// GET /loans → filter by userEmail, return serial IDs
// GET /loans → filter by userEmail, add serialId
// GET /loans → fetch all loans or filter by userEmail
app.get('/loans', async (req, res) => {
  try {
    const { userEmail, limit } = req.query;
    const query = {};

    // Optional filter
    if (userEmail) query.userEmail = userEmail;

    let cursor = loanCollection.find(query);

    // Optional limit for Allloans page
    if (limit) cursor = cursor.limit(parseInt(limit));

    const loans = await cursor.toArray();

    // Add serialId for frontend display
    const loansWithSerialId = loans.map((loan, index) => ({
      serialId: index + 1,
      ...loan
    }));

    res.send(loansWithSerialId);

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server Error" });
  }
});

// dekete application
app.delete('/loans/:id', async (req, res) => {
  const { id } = req.params;
  const loan = await loanCollection.findOne({ _id: new ObjectId(id) });

  if (!loan) return res.status(404).send({ success: false, message: "Loan not found" });
  if (loan.status !== "Pending") return res.status(400).send({ success: false, message: "Only Pending loans can be cancelled" });

  await loanCollection.deleteOne({ _id: new ObjectId(id) });
  res.send({ success: true, message: "Loan cancelled successfully" });
});



// payment related apis

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
        price: '{{PRICE_ID}}',
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${YOUR_DOMAIN}?success=true`,
  });

  res.redirect(303, session.url);
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
