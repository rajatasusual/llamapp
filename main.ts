import {
    RunnablePassthrough,
    RunnableSequence,
} from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { pull } from "langchain/hub";
import { PromptTemplate } from "@langchain/core/prompts";
import { RedisVectorStore } from "@langchain/redis";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

import * as readline from 'readline';
import * as fs from 'fs';

import { addDocuments, loadHTMLDoc, loadPostmanCollection } from "./loader";
import { configureEnvironment } from "./config";

import { rewrite } from "./chains/rewriter";

import 'dotenv/config';
import { RelevantDocumentsRetriever } from "./relevantDocsRetriever";


const { chatLLM, documentStore, apiStore, embeddings } = configureEnvironment();

const main = async () => {

    if (process.env.LOAD_DOCS === 'true') {
        await loadDocuments(documentStore, 'docs/expert_answers.html');
        await loadDocuments(apiStore, 'docs/qualtrics_postman_collection.json');
    }

    const retriever = documentStore.asRetriever();
    const ragPrompt = await pull<PromptTemplate>("rlm/rag-prompt");

    const qaChain = RunnableSequence.from([
        {
            context: (input: { question: string }, callbacks) => {
                const retrieverAndFormatter = retriever.pipe(formatDocumentsAsString);
                return retrieverAndFormatter.invoke(input.question, callbacks);
            },
            question: new RunnablePassthrough(),
        },
        ragPrompt,
        chatLLM,
        new StringOutputParser(),
    ]);

    await promptQuestion(qaChain, chatLLM);
}

const promptQuestion = async (qaChain: any, chatLLM: any) => {

    //ask for user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('You: ', async (question) => {

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

        console.log("RAG: " + chainRes.answer);

        rl.close();
        //log the result
        fs.writeFileSync("output.json", JSON.stringify({
            data: new Date().toISOString(),
            chainRes
        }), { encoding: 'utf8' });

        //ask again
        promptQuestion(qaChain, chatLLM);

    });

};

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

main();