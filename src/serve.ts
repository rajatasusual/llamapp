import express from 'express';
import 'dotenv/config';
var cors = require('cors');
import bodyParser from 'body-parser';

import { respond } from './main';

const app = express();

app.use(bodyParser.json());
app.use(cors())

const port = process.env.PORT || 3000;

// Define a POST endpoint
app.post('/respond', (req, res) => {


    try {
        (async ()=> {
            const question: string = req.body.question as string;
        if (!question) {
            return res.status(400).send({ error: 'Question is required' });
        }
        const answer = await respond(question);
        res.send({ answer });
        })();
    } catch (error) {
        console.error('Error processing question:', error);
        res.status(500).send({ error: 'Failed to process the question' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});