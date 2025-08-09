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

// MongoDB Connection
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
    payment_type: String,
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
                tx_ref: Date.now().toString(),
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

    console.log('✅ Webhook data received:', req.body);

    try {
        const { tx_ref, flw_ref, amount, currency, status, payment_type, customer } = req.body.data;

        const newTransaction = new Transaction({
            tx_ref,
            flw_ref,
            amount,
            currency,
            status,
            payment_type,
            customer: {
                name: customer.name,
                email: customer.email,
                phone_number: customer.phone_number
            }
        });

        await newTransaction.save();
        console.log(`✅ Transaction saved: ${newTransaction._id}`);
    } catch (err) {
        console.error("❌ Error saving transaction:", err);
    }

    res.status(200).send('Webhook received');
});

// Fetch all transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ created_at: -1 });
        res.json(transactions);
    } catch (err) {
        console.error("❌ Error fetching transactions:", err);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
