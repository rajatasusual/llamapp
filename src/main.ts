import { PromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

import * as readline from 'readline';
import * as fs from 'fs';

import { configureEnvironment } from "./engine/config";
import { rewrite } from "./engine/chains/rewriter";

import 'dotenv/config';
import { Document } from "langchain/document";
import { fusion } from "./engine/chains/fusion";
import { downloadAndExtractRepo } from "./engine/loaders/GithubLoader";

import { readDirectorySync } from "./engine/loader";

const { chatLLM, retriever, client } = configureEnvironment();

const cli = async () => {

    //if we want to load docs
    if (process.env.LOAD_DOCS === 'true') {

        const directory = await downloadAndExtractRepo("rajatasusual", "llamapp", "main");

        await readDirectorySync(directory, retriever);

    }

    await promptQuestion();
}

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

const updateConfig = (config: any) => {
    if (config) {
        Object.keys(config).forEach(key => {
            process.env[key] = config[key];
        });
    }
}

export { cli, respond, log };