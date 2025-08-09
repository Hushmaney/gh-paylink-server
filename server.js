const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Debug check for Flutterwave secret key
if (!process.env.FLW_SECRET_KEY) {
    console.error("❌ ERROR: FLW_SECRET_KEY is missing from environment variables.");
} else {
    console.log("✅ FLW_SECRET_KEY loaded successfully.");
}

app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection error:", err));

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    tx_ref: String,
    flw_ref: String,
    amount: Number,
    currency: String,
    status: String,
    customer: {
        name: String,
        email: String,
        phone_number: String
    },
    created_at: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Payment Route
app.post('/api/pay', async (req, res) => {
    try {
        const { name, email, amount } = req.body;

        if (!name || !email || !amount) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        console.log(`🔹 Initiating payment for ${name} (${email}), amount: ${amount}`);

        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: `ghpaylink-${Date.now()}`,
                amount,
                currency: 'GHS',
                redirect_url: 'https://unrivaled-granita-5b2b9b.netlify.app/success.html',
                customer: { email, name },
                customizations: {
                    title: 'GH Paylink',
                    description: 'Payment for services',
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.json(response.data);

    } catch (error) {
        console.error("❌ Payment initiation failed:", error.response?.data || error.message);
        res.status(500).json({ message: 'Payment initiation failed' });
    }
});

// Webhook Route
app.post('/webhook', async (req, res) => {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    if (!signature || signature !== secretHash) {
        console.warn("⚠️ Invalid webhook signature");
        return res.status(401).send('Invalid signature');
    }

    const data = req.body.data;
    console.log('✅ Webhook data received:', req.body);

    try {
        // ✅ Check if transaction already exists
        const existingTx = await Transaction.findOne({ tx_ref: data.tx_ref });
        if (existingTx) {
            console.log(`⚠️ Duplicate transaction ignored: ${data.tx_ref}`);
        } else {
            // Save only if not already in DB
            const newTransaction = new Transaction({
                tx_ref: data.tx_ref,
                flw_ref: data.flw_ref,
                amount: data.amount,
                currency: data.currency,
                status: data.status,
                customer: {
                    name: data.customer.name,
                    email: data.customer.email,
                    phone_number: data.customer.phone_number
                },
                created_at: new Date(data.created_at)
            });

            await newTransaction.save();
            console.log("✅ Transaction saved:", newTransaction._id);
        }
    } catch (err) {
        console.error("❌ Error saving transaction:", err.message);
    }

    res.status(200).send('Webhook received');
});

// Admin route to fetch transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ created_at: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch transactions' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
