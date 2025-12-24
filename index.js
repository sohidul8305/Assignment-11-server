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
  userCollection = db.collection("users");

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
  const loans = await loanCollection.find(filter).toArray();
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
});


// ======================
// UPDATE USER (Role / Suspend)
// ======================
app.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, suspendReason } = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });

    const updateFields = {};
    if (role) updateFields.role = role;
    if (status) updateFields.status = status;
    if (suspendReason) updateFields.suspendReason = suspendReason;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });

    res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.delete("/loans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).send({ success: false, message: "Invalid loan ID" });

    const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0)
      return res.status(404).send({ success: false, message: "Loan not found" });

    res.send({ success: true, message: "Loan deleted successfully" });
  } catch (err) {
    console.error("Delete loan error:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

 // GET ALL LOAN APPLICATIONS
  app.get("/loan-applications", async (req, res) => {
    try {
      const { status } = req.query;
      const filter = {};
      if (status) filter.status = status;

      const loans = await loanCollection.find(filter).toArray();

      res.json(loans);
    } catch (err) {
      console.error("Fetch loan applications error:", err);
      res.status(500).json({ message: "Failed to fetch loan applications" });
    }
  });

// ======================
// UPDATE LOAN
// ======================
app.patch("/loans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body.updates || req.body; // <-- handle frontend 'updates' key

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid loan ID" });
    }

    // Logging for debug
    console.log("Updating loan:", id, updates);

    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Loan not found" });
    }

    res.send({ success: true, message: "Loan updated successfully" });
  } catch (err) {
    console.error("Update loan error:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});








// GET ALL USERS
// GET ALL USERS FROM LOANS
// GET /users API (backend)
app.get("/users", async (req, res) => {
  try {
    const users = await loanCollection
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            name: { $first: "$borrowerName" }, // Name field
            email: { $first: "$userEmail" },
            role: { $first: "borrower" },
          },
        },
        { $project: { _id: 0, name: 1, email: 1, role: 1 } },
      ])
      .toArray();

    res.json(users);
  } catch (err) {
    console.error("Error fetching users from loans:", err);
    res.status(500).send({ message: "Failed to fetch users" });
  }
});








  // ======================
  // UPDATE LOAN APPLICATION STATUS
  // ======================
// UPDATE LOAN
app.patch("/loans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid loan ID" });
    }

    // Logging req.body for debug
    console.log("Updating loan:", id, updates);

    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Loan not found" });
    }

    res.send({ success: true, message: "Loan updated successfully" });
  } catch (err) {
    console.error("Update loan error:", err);
    res.status(500).send({ success: false, error: err.message });
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
