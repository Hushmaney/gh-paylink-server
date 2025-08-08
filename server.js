const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors'); // Added CORS

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));

// Payment Route
app.post('/api/pay', async (req, res) => {
    try {
        const { name, email, amount } = req.body;

        if (!name || !email || !amount) {
            return res.status(400).json({ message: 'All fields are required' });
        }

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
        console.error(error.response?.data || error.message);
        res.status(500).json({ message: 'Payment initiation failed' });
    }
});

// Webhook Route
app.post('/webhook', (req, res) => {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    if (!signature || signature !== secretHash) {
        return res.status(401).send('Invalid signature');
    }

    console.log('Webhook data:', req.body);

    res.status(200).send('Webhook received');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
