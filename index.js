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
  app.post("/loan-applications", async (req, res) => {
    const loan = {
      ...req.body,
      status: "Pending",
      feeStatus: "unpaid",
      applicationDate: new Date(),
    };
    const result = await loanCollection.insertOne(loan);
    res.send({ success: true, insertedId: result.insertedId });
  });

  // GET LOANS
  app.get("/loans", async (req, res) => {
    const query = req.query.userEmail ? { userEmail: req.query.userEmail } : {};
    const loans = await loanCollection.find(query).toArray();
    res.send(loans);
  });

  // DELETE LOAN
  app.delete("/loans/:id", async (req, res) => {
    await loanCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: true });
  });

  // CREATE CHECKOUT SESSION
  app.post("/create-checkout-session", async (req, res) => {
    const { loanId, loanTitle, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 1000, // $10
            product_data: { name: `Loan Fee - ${loanTitle}` },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      metadata: { loanId, loanTitle },
      success_url: `${process.env.CLIENT_URL}/myloans?success=true`,
      cancel_url: `${process.env.CLIENT_URL}/myloans?success=false`,
    });

    res.send({ url: session.url });
  });

  // STRIPE WEBHOOK
  app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.log("⚠️ Webhook signature verification failed.", err.message);
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

run();

app.listen(process.env.PORT, () =>
  console.log(`🚀 Server running on port ${process.env.PORT}`)
);
