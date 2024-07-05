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

const { chatLLM, documentStore, apiStore, embeddings } = configureEnvironment();

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

const respond = async (question: string) => {
    question = process.env.REWRITE === "true" ? await rewrite(question, chatLLM) : question;

        const questionAnsweringPrompt = PromptTemplate.fromTemplate(
            `Answer the user's question from the following context. This is your only source of truth.: 
    {context}
    Question: {input}`
        );

        const combineDocsChain = await createStuffDocumentsChain({
            llm: chatLLM,
            prompt: questionAnsweringPrompt
        });

        const retriever = new RelevantDocumentsRetriever({
            vectorStores: Array.from([documentStore, apiStore]),
            embeddings
        });

        const chain = await createRetrievalChain({
            retriever,
            combineDocsChain
        });

        const chainRes = await chain.invoke({ input: question });

        //log the result
        fs.writeFileSync("output.json", JSON.stringify({
            data: new Date().toISOString(),
            chainRes
        }), { encoding: 'utf8', flag: 'a' });


        return chainRes;
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

export { cli, respond };