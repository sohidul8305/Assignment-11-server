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
      newLoan.status = "Pending";
      newLoan.feeStatus = "unpaid";

      const result = await loanCollection.insertOne(newLoan);
      res.send({ success: !!result.insertedId, loanId: result.insertedId });
    } catch (error) {
      console.error("Add Loan Error:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  });

  // ======================
  // GET ALL LOANS (Manager)
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
  // CREATE LOAN APPLICATION (User)
  // ======================
  app.post("/loan-applications", async (req, res) => {
    try {
      const { userEmail, borrowerName, loanTitle, loanAmount } = req.body;
      if (!userEmail || !borrowerName || !loanTitle || !loanAmount)
        return res.status(400).send({ message: "Missing required fields." });

      const loan = {
        userEmail: userEmail.toLowerCase().trim(),
        borrowerName,
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

 app.get("/loan-applications", async (req, res) => {
  try {
    const { email, status } = req.query;
    const filter = {};
    if (email) filter.userEmail = email.toLowerCase().trim();
    if (status) filter.status = status;

    const loans = await loanCollection.find(filter).toArray();

    // সরাসরি userEmail এবং borrowerName return করবে
    const safeLoans = loans.map((loan) => ({
      _id: loan._id,
      borrowerName: loan.borrowerName || "",
      userEmail: loan.userEmail || "",
      loanTitle: loan.loanTitle || "",
      loanAmount: loan.loanAmount || 0,
      applicationDate: loan.applicationDate || null,
      status: loan.status || "Pending",
      approvedAt: loan.approvedAt || null,
    }));

    res.json(safeLoans);
  } catch (err) {
    console.error("Error fetching loan applications:", err);
    res.status(500).json({ message: "Failed to fetch loan applications" });
  }
});


  // ======================
  // UPDATE LOAN APPLICATION STATUS
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
  // Confirm payment
  // ======================
  app.post("/confirm-payment", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).send({ message: "Session ID missing" });

      const payment = await paymentsCollection.findOne({ sessionId });
      if (!payment) return res.status(404).send({ message: "Payment not found" });

      const loanId = payment.loanId;

      await loanCollection.updateOne(
        { _id: new ObjectId(loanId) },
        { $set: { feeStatus: "paid", status: "Approved" } }
      );

      res.send({ success: true, message: "Loan payment confirmed" });
    } catch (err) {
      console.error("Confirm payment error:", err);
      res.status(500).send({ success: false, error: err.message });
    }
  });

  // ======================
  // Stripe checkout & webhook can stay same
  // ======================
}

run().catch(console.error);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
