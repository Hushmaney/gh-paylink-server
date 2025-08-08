const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const crypto = require("crypto");
const axios = require("axios");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

/**
 * ROOT ROUTE
 */
app.get("/", (req, res) => {
    res.send("gh-paylink backend running!");
});

/**
 * PAYMENT ROUTE
 * Creates a payment link via Flutterwave API
 */
app.post("/api/pay", async (req, res) => {
    const { name, email, amount } = req.body;

    if (!name || !email || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const flwResponse = await axios.post(
            "https://api.flutterwave.com/v3/payments",
            {
                tx_ref: "ghpaylink-" + Date.now(),
                amount,
                currency: "GHS",
                redirect_url: "https://your-frontend-url.netlify.app/success.html",
                customer: {
                    email,
                    name
                },
                customizations: {
                    title: "GH Paylink Payment",
                    description: "Payment via GH Paylink"
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const link = flwResponse.data?.data?.link;
        if (!link) {
            return res.status(500).json({ error: "No payment link returned" });
        }

        res.json({ link });
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Payment initiation failed" });
    }
});

/**
 * WEBHOOK ROUTE
 * Handles payment notifications from Flutterwave
 */
app.post("/webhook", (req, res) => {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== secretHash) {
        return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.body;
    console.log("Webhook received:", event);

    // TODO: Process the payment event here (save to DB, update status, etc.)

    res.status(200).send("Webhook received successfully");
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
