import { PromptTemplate } from "@langchain/core/prompts";
import { RedisVectorStore } from "@langchain/redis";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

import * as readline from 'readline';
import * as fs from 'fs';

import { addDocuments, loadHTMLDoc, loadPostmanCollection } from "./engine/loader";
import { configureEnvironment } from "./engine/config";
import { rewrite } from "./engine/chains/rewriter";
import { RelevantDocumentsRetriever } from "./engine/chains/retriever";

import 'dotenv/config';
import { fusion } from "./engine/chains/fusion";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "langchain/document";

const { chatLLM, documentStore, apiStore, embeddings, client } = configureEnvironment();

const cli = async () => {

    if (process.env.LOAD_DOCS === 'true') {
        await loadDocuments(documentStore, 'docs/expert_answers.html');
        await loadDocuments(apiStore, 'docs/qualtrics_postman_collection.json');
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

const respond = async (question: string, replyingToMessageId?: number) => {

    if (replyingToMessageId) {
        const messages = await client.lRange('messages', 0, -1);
        const message = messages.find((msg: string) => JSON.parse(msg).messageId === replyingToMessageId);
        
        if (message) {
            const parsedMessage = JSON.parse(message);
            question = await enrichMessage(parsedMessage, question);
        }
    }
    
    question = process.env.REWRITE === "true"  && !replyingToMessageId ? await rewrite(question, chatLLM) : question;

    const questionAnsweringPrompt = PromptTemplate.fromTemplate(
        `Answer the below question from the following context. This is your only source of truth.: 
    {context}
    Question: {input}`
    );

    const combineDocsChain = await createStuffDocumentsChain({
        llm: chatLLM,
        prompt: questionAnsweringPrompt
    });

    let retriever: any = new RelevantDocumentsRetriever({
        vectorStores: Array.from([documentStore, apiStore]),
        embeddings
    });

    if (process.env.FUSION === "true" && !replyingToMessageId) {
        const scoredDocuments = await fusion({ query: question, chatLLM, retriever });

        retriever = (await MemoryVectorStore.fromDocuments(scoredDocuments, embeddings)).asRetriever();

    }

    const retrievalChain = await createRetrievalChain({
        retriever,
        combineDocsChain
    });

    const chainRes = await retrievalChain.invoke({ input: question });

    //log the result
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


const loadDocuments = async (vectorStore: RedisVectorStore, path: string) => {
    if (path.endsWith('.html')) {
        const docs = await loadHTMLDoc(path);
        console.log("Total Documents: " + docs.length);

        await addDocuments(docs, vectorStore);
    }

    if (path.endsWith('.json')) {
        const docs = await loadPostmanCollection(path);
        console.log("Total Documents: " + docs.length);

        await addDocuments(docs, vectorStore);
    }
}

export { cli, respond, log };