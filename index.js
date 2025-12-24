require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(
  process.env.DB_PASS
)}@${process.env.DB_HOST}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri);

let loanCollection;
let loanApplicationsCollection;
let paymentsCollection;
let userCollection;
app.get('/', (req,res)=>{
  res.send("Server is runing 400")
})

async function run() {
  // await client.connect();
  const db = client.db(process.env.DB_NAME);

  loanCollection = db.collection("loans");
  loanApplicationsCollection = db.collection("loanApplications");
  paymentsCollection = db.collection("payments");
  userCollection = db.collection("users");

  console.log("✅ MongoDB connected");

  // ======================
  // ADD NEW LOAN (Manager)
  // ======================
  app.post("/loans", async (req, res) => {
    try {
      const { title, category, interest, maxLimit, shortDesc, image, emiPlans } = req.body;

      if (!title || !category || !interest || !maxLimit || !shortDesc || !image) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const loan = {
        title,
        category,
        interest: Number(interest),
        maxLimit: Number(maxLimit),
        shortDesc,
        image,
        emiPlans: emiPlans || [],
        createdAt: new Date(),
        status: "Pending",
        feeStatus: "unpaid",
      };

      const result = await loanCollection.insertOne(loan);
      res.json({ success: true, loanId: result.insertedId });
    } catch (err) {
      console.error("Add loan error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ======================
  // GET ALL LOANS
  // ======================
  app.get("/loans", async (req, res) => {
    try {
      const loans = await loanCollection.find().toArray();
      res.json(loans);
    } catch (err) {
      console.error("Get loans error:", err);
      res.status(500).json({ message: "Failed to fetch loans" });
    }
  });

  // ======================
  // DELETE LOAN
  // ======================
  app.delete("/loans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid loan ID" });

      const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ success: false, message: "Loan not found" });

      res.json({ success: true, message: "Loan deleted successfully" });
    } catch (err) {
      console.error("Delete loan error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ======================
  // CREATE LOAN APPLICATION (User)
  // ======================
  app.post("/loan-applications", async (req, res) => {
    try {
      const { userEmail, borrowerName, loanTitle, loanAmount, loanCategory } = req.body;
      if (!userEmail || !borrowerName || !loanTitle || !loanAmount) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const application = {
        userEmail,
        borrowerName,
        loanTitle,
        loanCategory: loanCategory || "N/A",
        loanAmount: Number(loanAmount),
        status: "Pending",
        applicationDate: new Date(),
      };

      const result = await loanApplicationsCollection.insertOne(application);
      res.status(201).json({ success: true, insertedId: result.insertedId });
    } catch (err) {
      console.error("Create loan application error:", err);
      res.status(500).json({ success: false, message: "Failed to create loan application" });
    }
  });

  // ======================
  // GET LOAN APPLICATIONS (Admin / Manager) with status filter
  // ======================
  app.get("/loan-applications", async (req, res) => {
    try {
      const { status } = req.query;
      const query = {};
      if (status && status !== "all") query.status = status;

      const applications = await loanApplicationsCollection.find(query).sort({ applicationDate: -1 }).toArray();
      res.json(applications);
    } catch (err) {
      console.error("Fetch loan applications error:", err);
      res.status(500).json({ message: "Error loading loan applications" });
    }
  });

  // ======================
  // UPDATE LOAN APPLICATION STATUS
  // ======================
  app.patch("/loan-applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

      const result = await loanApplicationsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
      if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "Application not found" });

      res.json({ success: true, message: "Application updated" });
    } catch (err) {
      console.error("Update loan application error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });



  // ======================
  // UPDATE USER (Role / Suspend)
  // ======================
  app.patch("/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { role, status, suspendReason } = req.body;

      if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });

      const updateFields = {};
      if (role) updateFields.role = role;
      if (status) updateFields.status = status;
      if (suspendReason) updateFields.suspendReason = suspendReason;

      const result = await userCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
      if (result.matchedCount === 0) return res.status(404).json({ message: "User not found" });

      res.json({ success: true, message: "User updated successfully" });
    } catch (err) {
      console.error("Update user error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ======================
  // GET ALL USERS
  // ======================
  app.get("/users", async (req, res) => {
    try {
      const users = await loanApplicationsCollection
        .aggregate([
          {
            $group: {
              _id: "$userEmail",
              name: { $first: "$borrowerName" },
              email: { $first: "$userEmail" },
              role: { $first: "borrower" },
            },
          },
          { $project: { _id: 0, name: 1, email: 1, role: 1 } },
        ])
        .toArray();

      res.json(users);
    } catch (err) {
      console.error("Fetch users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

// CREATE CHECKOUT SESSION (Stripe)
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { loanId, email } = req.body;

    if (!loanId || !email) return res.status(400).json({ message: "Missing fields" });

    // Fixed fee 1000 BDT (10 USD approx) => 1000*100 = amount in cents
    const amountInBDT = 1000;
const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  customer_email: email,
  line_items: [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: `Loan Fee for Loan ID: ${loanId}`,
        },
        unit_amount: 10 * 100, // 10 USD → cents
      },
      quantity: 1,
    },
  ],
  mode: "payment",
  success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?loanId=${loanId}`,
  cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
});


    // Save session in DB
    await paymentsCollection.insertOne({
      sessionId: session.id,
      loanId,
      email,
      amount: amountInBDT,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
});




// --------------------------
  // CONFIRM PAYMENT
  // --------------------------
  app.post("/confirm-payment", async (req, res) => {
    try {
      const { sessionId, loanId } = req.body;
      if (!sessionId || !loanId) return res.status(400).json({ message: "Missing sessionId or loanId" });

      const payment = await paymentsCollection.findOne({ sessionId });
      if (!payment) return res.status(404).json({ message: "Payment not found" });

      // Update loanApplicationsCollection
      await loanApplicationsCollection.updateOne(
        { _id: new ObjectId(loanId) },
        { $set: { feeStatus: "paid", status: "Approved" } }
      );

      res.json({ success: true, message: "Payment confirmed" });
    } catch (err) {
      console.error("Confirm payment error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

run().catch(console.error);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
