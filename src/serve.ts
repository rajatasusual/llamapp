import express from 'express';
import 'dotenv/config';

import { load, log, respond } from './main';

var cors = require('cors');
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });

const app = express();
app.use(express.json());
app.use(cors())

const port = process.env.PORT || 3000;

// Define a POST endpoint
app.post('/respond', (req, res) => {


    try {
        (async () => {
            const config = req.body.config;
            const question: string = req.body.question as string;
            const replyingToMessageId: number = req.body.messageId as number;

            if (!question) {
                return res.status(400).send({ error: 'Question is required' });
            }
            const answer = await respond(question, replyingToMessageId, config);
            const messageId = Math.floor(Math.random() * 10000000);
            res.send({ answer, messageId });

            answer["messageId"] = messageId;

            log(answer);

        })();
    } catch (error) {
        console.error('Error processing question:', error);
        res.status(500).send({ error: 'Failed to process the question' });
    }
});

// Endpoint to handle file upload
app.post('/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        try {
            (async () => {
                const fileId = req.file && await load(req.file);

                if (!fileId) {
                    res.json({ success: true, message: 'File either already exists or failed to upload.' });
                } else {
                    res.json({ success: true, message: 'File uploaded successfully.', fileId });
                }
            })();
        } catch (error) {
            console.error('Error processing question:', error);
            res.status(500).send({ error: 'Failed to process the question' });
        }
    } else {
        res.json({ success: false, message: 'File upload failed.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});