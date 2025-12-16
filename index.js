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
app.post("/loan-applications", async (req, res) => {
    try {
        // ১. কালেকশন ইনিশিয়ালাইজেশন চেক (যদি ইনিশিয়ালাইজ না হয়, তবে এটি 503 দেবে)
        if (!loanCollection) { 
            console.error("MongoDB Error: loanCollection is not initialized.");
            return res.status(503).send({ success: false, message: "Database service unavailable." });
        }
        
        // ২. প্রয়োজনীয় ফিল্ড চেক
        const { userEmail, loanTitle, loanAmount } = req.body;
        if (!userEmail || !loanTitle || !loanAmount) {
             return res.status(400).send({ message: "Missing required fields." });
        }

        const loan = {
            ...req.body,
            userEmail: userEmail.toLowerCase().trim(), 
            status: "Pending",
            feeStatus: "unpaid",
            applicationDate: new Date(),
        };

        const result = await loanCollection.insertOne(loan);
        
        if (result.insertedId) {
            // সফল হলে 201 Created স্ট্যাটাস পাঠানো উচিত
            res.status(201).send({ success: true, insertedId: result.insertedId, message: "Loan application saved successfully." });
        } else {
             res.status(500).send({ success: false, message: "Database insert operation failed unexpectedly." });
        }
        
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

  // STRIPE CHECKOUT SESSION
  app.post("/create-checkout-session", async (req, res) => {
    try {
      const { loanId, loanTitle, email } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 1000,
              product_data: { name: `Loan Fee - ${loanTitle}` },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: email,
        metadata: { loanId, loanTitle },
        success_url: `${process.env.CLIENT_URL}/payment-success?loanId=${loanId}`,
        cancel_url: `${process.env.CLIENT_URL}/myloans`,
      });

      res.send({ url: session.url });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // STRIPE WEBHOOK
  app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.log("Webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await loanCollection.updateOne(
        { _id: new ObjectId(session.metadata.loanId) },
        {
          $set: {
            feeStatus: "Paid",
            payment: {
              transactionId: session.payment_intent,
              email: session.customer_email,
              loanTitle: session.metadata.loanTitle,
              amount: 10,
              date: new Date(),
            },
          },
        }
      );
    }

    res.json({ received: true });
  });
}

run().catch(err => console.error(err));

app.listen(process.env.PORT || 4000, () => console.log(`Server running on port ${process.env.PORT || 4000}`));