import { PromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

import * as readline from 'readline';
import * as fs from 'fs';

import { configureEnvironment } from "./engine/config";
import { rewrite } from "./engine/chains/rewriter";

import 'dotenv/config';
import { Document } from "langchain/document";
import { fusion } from "./engine/chains/fusion";
import { downloadAndExtractRepo } from "./engine/loaders/GithubLoader";

import { fetchDocument, loadHTMLDoc, loadJSONDoc, readDirectorySync } from "./engine/loader";
import { TextLoader } from "langchain/document_loaders/fs/text";

const { chatLLM, retriever, client } = configureEnvironment();

/**
 * Asynchronous function for handling CLI operations. 
 */
const cli = async () => {

    //if we want to load docs
    if (process.env.LOAD_DOCS === 'true') {

        const directory = await downloadAndExtractRepo("rajatasusual", "llamapp", "main");

        await readDirectorySync(directory, retriever);

    }

    await promptQuestion();
}

/**
 * Loads a file asynchronously and fetches the document to add it to the retriever based on the file type.
 *
 * @param {Express.Multer.File} file - The file to be loaded
 * @return {Promise<string>} The ID of the added document
 */
const load = async (file: Express.Multer.File) => {
    const fileId = await fetchDocument(file.path, retriever,
        file.mimetype === 'application/json' ? loadJSONDoc : 
        file.mimetype === 'text/html' ? loadHTMLDoc :
        file.mimetype === 'application/pdf' ? PDFLoader :
        TextLoader
    );

    return fileId;
}

/**
 * Asynchronously prompts the user for input and responds with a message from the RAG model.
 *
 * @return {Promise<void>} A promise that resolves when the user has inputted their question and the RAG model has responded.
 */
const promptQuestion = async () => {

    //ask for user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('You: ', async (question) => {

        const response = await respond(question);

        console.log("RAG: " + response.answer);

        rl.close();

        //ask again
        promptQuestion();

    });

};

/**
 * Logs the chain result with message ID, date, context, answer, and additional information.
 *
 * @param {{ context: Document[]; answer: string; } & { [key: string]: unknown; }} chainRes - The chain result object containing context, answer, and additional information
 * @return {Promise<void>} Promise that resolves after storing the message
 */
const log = async (chainRes: {
    context: Document[];
    answer: string;
} & {
    [key: string]: unknown;
}) => {
    const messageId = chainRes['messageId'];
    await client.rPush('messages', JSON.stringify({
        messageId,
        date: new Date().toISOString(),
        context: chainRes.context,
        answer: chainRes.answer,
        additionalInfo: chainRes
    }));

    console.log("messageId: " + messageId);
}

/**
 * A function that handles responding to a question by updating configuration settings, enriching the question, rewriting the question if needed, creating a question answering prompt, creating a chain to combine documents, initializing the retriever, using fusion if enabled, creating a retrieval chain, invoking the retrieval chain, logging the result, and returning the chain result.
 *
 * @param {string} question - The question to respond to
 * @param {number} [replyingToMessageId] - The ID of the message being replied to
 * @param {any} [config] - Configuration settings
 * @return {Promise<any>} A promise that resolves with the chain result
 */
const respond = async (question: string, replyingToMessageId?: number, config?: any): Promise<any> => {
    // Update configuration settings
    updateConfig(config);

    // Check if replying to a specific message
    if (replyingToMessageId) {
        const messages = await client.lRange('messages', 0, -1);
        const message = messages.find((msg: string) => JSON.parse(msg).messageId === replyingToMessageId);

        if (message) {
            const parsedMessage = JSON.parse(message);
            question = await enrichMessage(parsedMessage, question);
        }
    }

    // Optionally rewrite the question
    const shouldRewrite = process.env.REWRITE === "true" && !replyingToMessageId;
    if (shouldRewrite) {
        question = await rewrite(question, chatLLM);
    }

    // Create the question answering prompt
    const questionAnsweringPrompt = PromptTemplate.fromTemplate(
        `Answer the below question from the following context. This is your only source of truth.: 
        {context}
        Question: {input}`
    );

    // Create the chain to combine documents
    const combineDocsChain = await createStuffDocumentsChain({
        llm: chatLLM,
        prompt: questionAnsweringPrompt
    });

    // Initialize the retriever
    let memoryVRetriever = new MemoryVectorStore(retriever.embeddings).asRetriever();

    // Use fusion if enabled and not replying to a specific message
    const useFusion = process.env.FUSION === "true" && !replyingToMessageId;
    if (useFusion) {
        const docs = await fusion({ query: question, chatLLM, retriever });
        memoryVRetriever = (await MemoryVectorStore.fromDocuments(docs, retriever.embeddings)).asRetriever();
    }

    // Create the retrieval chain
    const retrievalChain = await createRetrievalChain({
        retriever: useFusion ? memoryVRetriever : retriever,
        combineDocsChain
    });

    // Invoke the retrieval chain
    const chainRes = await retrievalChain.invoke({ input: question });

    // Log the result
    fs.writeFileSync("output.jsonl", JSON.stringify({
        date: new Date().toISOString(),
        chainRes
    }), { encoding: 'utf8', flag: 'a' });

    return chainRes;
}

/**
 * Enriches the user query based on previous context and messages.
 *
 * @param {any} message - The previous message containing context and additional information
 * @param {string} question - The new question to enrich
 * @return {string} The enriched question with context and previous message details
 */
const enrichMessage = (message: any, question: string) => {
    const enrichedQuestionAnsweringPrompt = PromptTemplate.fromTemplate(
        `You have received a new question to answer. Utilize the context provided as well as the previous message to enrich your response. This is your only source of truth.
    
    Context: 
    {context}
    
    Previous Question: 
    {previousQuestion}

    Previous Message: 
    {previousMessage}
    
    Question: 
    {input}
    
    Provide a detailed and accurate response based on the above context and previous message.`
    );

    return enrichedQuestionAnsweringPrompt.format({
        context: message.context.map((doc: any) => doc.pageContent).join('\n\n'),
        previousMessage: message.answer,
        previousQuestion: message.additionalInfo.input,
        input: question.split(':').slice(1).join('')
    });
}

/**
 * Updates the configuration values in the environment variables.
 *
 * @param {any} config - The configuration object to update the environment variables
 */
const updateConfig = (config: any) => {
    if (config) {
        Object.keys(config).forEach(key => {
            process.env[key] = config[key];
        });
    }
}

export { cli, respond, log, load };