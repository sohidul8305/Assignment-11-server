// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(
  process.env.DB_PASS
)}@${process.env.DB_HOST}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri);
let loanCollection;

async function run() {
  await client.connect();
  loanCollection = client.db(process.env.DB_NAME).collection("loans");
  console.log("✅ MongoDB connected");

  // CREATE LOAN
// আপনার Express Server ফাইলে এই রুটটি যুক্ত করুন
app.patch("/loan-applications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ ADD THIS (NEW)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    if (status !== "Cancelled") {
      return res.status(400).json({ message: "Invalid status update" });
    }

    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id), status: "Pending" },
      {
        $set: {
          status: "Cancelled",
          cancelledAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Loan not found or cannot be cancelled",
      });
    }

    res.json({ success: true, message: "Loan cancelled successfully" });
  } catch (error) {
    console.error("Cancel loan error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/create-checkout-session", async (req, res) => {
  const { loanId, loanTitle, email } = req.body;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: loanTitle },
          unit_amount: 1000,
        },
        quantity: 1,
      },
    ],
    metadata: {
      loanId,
      loanTitle,
    },
    // ✅ এখানে বসবে
  success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancelled`,

  });

  res.send({ url: session.url });
});


// CREATE LOAN
  app.post("/loan-applications", async (req, res) => {
    try {
      const { userEmail, loanTitle, loanAmount } = req.body;
      if (!userEmail || !loanTitle || !loanAmount)
        return res.status(400).send({ message: "Missing required fields." });

      const loan = {
        userEmail: userEmail.toLowerCase().trim(),
        loanTitle,
        loanAmount,
        status: "Pending",
        feeStatus: "unpaid",
        applicationDate: new Date(),
      };

      const result = await loanCollection.insertOne(loan);
      if (result.insertedId)
        res.status(201).send({ success: true, insertedId: result.insertedId });
      else res.status(500).send({ success: false, message: "Insert failed" });
    } catch (err) {
      console.error("Error submitting loan application:", err.message);
      res.status(500).send({ success: false, error: "Internal Server Error." });
    }
  });

// আপনার Express Server ফাইলে এই রুটটি যুক্ত করুন
app.get("/loan-applications", async (req, res) => {
    try {
        if (!loanCollection) {
            return res.status(503).send({ message: "Database service unavailable." });
        }

        const email = req.query.email;
        let query = {};

        if (email) {
            // ইমেল কোয়েরি প্যারামিটার ব্যবহার করে ডেটা ফিল্টার করা হচ্ছে
            query = { userEmail: email };
        }
        // আপনি যদি কোনো Admin Route না রাখেন, তবে এটি শুধু ইউজার ইমেল ফিল্টার করবে।

        const loans = await loanCollection.find(query).toArray();
        res.send(loans);

    } catch (err) {
        console.error("Error fetching loan applications:", err.message);
        res.status(500).send({ message: "Failed to fetch loan data." });
    }
});



  // GET LOANS (list)
  app.get("/loans", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 0;
      const loans = await loanCollection.find().limit(limit).toArray();
      res.send(loans);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // GET LOAN BY ID
  app.get("/loans/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      if (!loan) return res.status(404).send({ message: "Loan not found" });
      res.send(loan);
    } catch (err) {
      res.status(500).send({ message: "Server error", error: err.message });
    }
  });

app.get("/loans/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
  const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
  if (!loan) return res.status(404).send({ message: "Loan not found" });
  res.send(loan);
});

  // DELETE LOAN
  app.delete("/loans/:id", async (req, res) => {
    try {
      await loanCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send({ success: true });
    } catch (err) {
      res.status(500).send({ success: false, error: err.message });
    }
  });

  // Cancel loan application
// Cancel loan application
app.patch("/loan-applications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    if (status !== "Cancelled") {
      return res.status(400).json({ message: "Invalid status update" });
    }

    // Correct collection variable
    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id), status: "Pending" }, // শুধু Pending হলে cancel হবে
      {
        $set: {
          status: "Cancelled",
          cancelledAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Loan not found or cannot be cancelled",
      });
    }

    res.json({ success: true, message: "Loan cancelled successfully" });
  } catch (error) {
    console.error("Cancel loan error:", error);
    res.status(500).json({ message: "Server error" });
  }
});



// mark loan as paid
app.post("/mark-loan-paid/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid loan ID" });

    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { feeStatus: "paid" } }
    );

    if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });

    res.send({ success: true, message: "Loan feeStatus updated to paid" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

  // STRIPE CHECKOUT SESSION




// GET PAYMENT DETAILS BY SESSION ID
// SIMPLE PAYMENT DETAILS (NO DB DEPENDENCY)
app.get("/payment-details", async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).send({ message: "Session ID missing" });
    }

    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      {
        expand: ["customer_details"],
      }
    );

    // 🔍 Debug (একবার দেখো)
    console.log("Stripe session:", session);

    res.send({
      transactionId: session.payment_intent,   // ✅ Transaction ID
      trackingId: session.id,                  // ✅ Tracking ID
      email:
        session.customer_email ||
        session.customer_details?.email ||     // ✅ REAL email
        "N/A",
      loanTitle: session.metadata?.loanTitle || "N/A",
      amount: session.amount_total / 100,
      currency: session.currency,
      status: session.payment_status,
    });
  } catch (err) {
    console.error("Payment details error:", err);
    res.status(500).send({ message: "Failed to load payment info" });
  }
});









/* =======================
   🔥 STRIPE WEBHOOK (FIRST)
======================= */
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook Error:", err.message);
      return res.status(400).send("Webhook Error");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const loanId = session.metadata.loanId;

      console.log("✅ WEBHOOK HIT | Loan:", loanId);

      await loanCollection.updateOne(
        { _id: new ObjectId(loanId) },
        { $set: { feeStatus: "paid" } }
      );
    }

    res.sendStatus(200);
  }
)};

/* =======================
   NORMAL MIDDLEWARE
======================= */
app.use(cors());
app.use(express.json());




run().catch(console.error);

app.listen(process.env.PORT || 4000, () =>
  console.log(`Server running on port ${process.env.PORT || 4000}`)
);