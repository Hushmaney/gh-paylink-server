// server.js
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
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

// --- MongoDB connection ---
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("❌ ERROR: MONGO_URI (or MONGODB_URI) is missing from environment variables.");
}
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection error:", err));

// --- Transaction model ---
const transactionSchema = new mongoose.Schema({
    tx_ref: String,
    flw_ref: String,
    amount: Number,
    charged_amount: Number,
    currency: String,
    status: String,
    payment_type: String,
    processor_response: String,
    customer: {
        id: Number,
        name: String,
        email: String,
        phone_number: String
    },
    created_at: { type: Date, default: Date.now },
    raw: Object
}, { collection: 'transactions' });

const Transaction = mongoose.model('Transaction', transactionSchema);

// --- Root route ---
app.get('/', (req, res) => {
    res.send('gh-paylink backend running!');
});

// --- Payment Route ---
app.post('/api/pay', async (req, res) => {
    try {
        const { name, email, amount } = req.body;

        if (!name || !email || !amount) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        console.log(`🔹 Initiating payment for ${name} (${email}), amount: ${amount}`);

        const flwResp = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: "ghpaylink-" + Date.now(),
                amount,
                currency: 'GHS',
                redirect_url: (process.env.FRONTEND_SUCCESS_URL || 'https://unrivaled-granita-5b2b9b.netlify.app/success.html'),
                customer: { email, name },
                customizations: {
                    title: 'GH Paylink',
                    description: 'Payment via GH Paylink'
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Return full response.data so client can read .data.link
        return res.json(flwResp.data);
    } catch (error) {
        console.error("❌ Payment initiation failed:", error.response?.data || error.message);
        return res.status(500).json({ message: 'Payment initiation failed', error: error.response?.data || error.message });
    }
});

// --- Webhook Route ---
app.post('/webhook', async (req, res) => {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    // signature check
    if (!signature || signature !== secretHash) {
        console.warn("⚠️ Invalid webhook signature", { received: signature, expected: secretHash ? '***present***' : '***missing***' });
        return res.status(401).send('Invalid signature');
    }

    // Received valid webhook
    try {
        const event = req.body;
        console.log("✅ Webhook data received:", JSON.stringify(event, null, 2));

        // Determine if this is a successful payment event (adjust based on webhook payload structure)
        // Flutterwave sends object with event and data in v4, and sometimes data.status === 'successful'
        const data = event.data || event; // both structures supported
        const eventType = event.event || event['event.type'] || event['event.type'] || null;

        // Check for success - we accept status === 'successful' or event.type includes 'charge.completed' etc.
        const isSuccessful = (data && (data.status === 'successful' || data.event === 'charge.completed')) ||
                             (eventType && (eventType.toLowerCase().includes('charge') || eventType.toLowerCase().includes('completed')));

        if (isSuccessful) {
            // extract fields safely
            const tx = {
                tx_ref: data.tx_ref || data.txref || (data?.flw_ref ? `ref-${data.flw_ref}` : undefined),
                flw_ref: data.flw_ref || data.flwref,
                amount: Number(data.amount) || Number(data.charged_amount) || 0,
                charged_amount: Number(data.charged_amount) || 0,
                currency: data.currency || 'GHS',
                status: data.status || 'successful',
                payment_type: data.payment_type || data.paymentType || null,
                processor_response: data.processor_response || data.processorResponse || null,
                customer: {
                    id: data.customer?.id || data.customer_id || null,
                    name: data.customer?.name || data.customer?.fullname || null,
                    email: data.customer?.email || null,
                    phone_number: data.customer?.phone_number || data.customer?.phone || null
                },
                created_at: data.created_at ? new Date(data.created_at) : new Date(),
                raw: event
            };

            // Save to MongoDB
            const saved = await Transaction.create(tx);
            console.log("✅ Transaction saved:", saved._id);

            // Optionally: send email / notification here (nodemailer) - left out to avoid config needs

            // Respond to Flutterwave
            return res.status(200).send('Webhook received');
        } else {
            // Not a successful payment (store if you want)
            console.log("ℹ️ Webhook received but not a successful payment. Event:", event?.event || eventType);
            return res.status(200).send('Webhook received (no action)');
        }
    } catch (err) {
        console.error("❌ Error processing webhook:", err);
        return res.status(500).send('Server error');
    }
});

// --- Start server ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
