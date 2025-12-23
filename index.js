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
let paymentsCollection;

async function run() {
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  loanCollection = db.collection("loans");
  paymentsCollection = db.collection("payments");

  console.log("✅ MongoDB connected");

  // ======================
  // ADD NEW LOAN (Manager)
  // ======================
  app.post("/loans", async (req, res) => {
    try {
      const newLoan = req.body;
      if (
        !newLoan.title ||
        !newLoan.category ||
        !newLoan.interest ||
        !newLoan.maxLimit ||
        !newLoan.shortDesc ||
        !newLoan.image
      )
        return res.status(400).send({ success: false, error: "Missing required fields" });

      newLoan.interest = Number(newLoan.interest);
      newLoan.maxLimit = Number(newLoan.maxLimit);
      newLoan.emiPlans = newLoan.emiPlans || [];
      newLoan.createdAt = new Date();

      const result = await loanCollection.insertOne(newLoan);
      res.send({ success: !!result.insertedId, loanId: result.insertedId });
    } catch (error) {
      console.error("Add Loan Error:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  });

  // ======================
  // GET ALL LOANS
  // ======================
  app.get("/loans", async (req, res) => {
    try {
      const loans = await loanCollection.find().toArray();
      res.send(loans);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // ======================
  // GET LOAN BY ID
  // ======================
  app.get("/loans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      if (!loan) return res.status(404).send({ message: "Loan not found" });

      res.send(loan);
    } catch (err) {
      res.status(500).send({ message: "Server error", error: err.message });
    }
  });

  // ======================
  // DELETE LOAN
  // ======================
  app.delete("/loans/:id", async (req, res) => {
    try {
      await loanCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send({ success: true });
    } catch (err) {
      res.status(500).send({ success: false, error: err.message });
    }
  });

  // ======================
  // CREATE LOAN APPLICATION (USER)
  // ======================
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
      res.status(result.insertedId ? 201 : 500).send({
        success: !!result.insertedId,
        insertedId: result.insertedId,
      });
    } catch (err) {
      console.error("Error submitting loan application:", err.message);
      res.status(500).send({ success: false, error: "Internal Server Error." });
    }
  });

  // ======================
  // GET LOAN APPLICATIONS (by email)
  // ======================
  app.get("/loan-applications", async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email missing" });

      const loans = await loanCollection.find({ userEmail: email.toLowerCase().trim() }).toArray();
      res.send(loans);
    } catch (err) {
      console.error("Error fetching loan applications:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // ======================
  // UPDATE LOAN APPLICATION STATUS (APPROVE / REJECT / CANCEL)
  // ======================
  app.patch("/loan-applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid loan ID" });
      if (!["Approved", "Rejected", "Cancelled"].includes(status))
        return res.status(400).json({ message: "Invalid status" });

      const updateFields = { status };
      if (status === "Approved") updateFields.approvedAt = new Date();
      if (status === "Cancelled") updateFields.cancelledAt = new Date();

      const result = await loanCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0)
        return res.status(404).json({ message: "Loan application not found" });

      res.json({ message: `Loan ${status.toLowerCase()} successfully` });
    } catch (err) {
      console.error("Update loan application error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ======================
  // MARK LOAN AS PAID
  // ======================
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

  // ======================
  // CREATE STRIPE CHECKOUT SESSION
  // ======================
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
      metadata: { loanId, loanTitle },
      success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancelled`,
    });

    res.send({ url: session.url });
  });

  // ======================
  // GET PAYMENT INFO BY LOAN ID
  // ======================
  app.get("/payment-info/:loanId", async (req, res) => {
    try {
      const { loanId } = req.params;
      if (!ObjectId.isValid(loanId)) return res.status(400).send({ message: "Invalid loan ID" });

      const payment = await paymentsCollection.findOne({ loanId });
      if (!payment) return res.status(404).send({ message: "Payment info not found" });

      res.send(payment);
    } catch (err) {
      console.error("Payment info fetch error:", err);
      res.status(500).send({ message: "Failed to fetch payment info" });
    }
  });

  // ======================
  // STRIPE WEBHOOK
  // ======================
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

        try {
          // Mark loan as paid
          await loanCollection.updateOne(
            { _id: new ObjectId(loanId) },
            { $set: { feeStatus: "paid" } }
          );

          // Save payment details
          await paymentsCollection.insertOne({
            sessionId: session.id,
            loanId,
            loanTitle: session.metadata.loanTitle,
            email: session.customer_email,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: session.payment_status,
            createdAt: new Date(),
          });

          console.log("✅ Payment saved for session:", session.id);
        } catch (err) {
          console.error("❌ Error saving payment:", err);
        }
      }

      res.sendStatus(200);
    }
  );
}

run().catch(console.error);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
