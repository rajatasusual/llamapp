import * as crypto from 'crypto';

import {
    RunnableSequence,
} from "@langchain/core/runnables";

import { Document } from "@langchain/core/documents";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import 'dotenv/config';
import { ChatOllama } from "@langchain/community/chat_models/ollama";

const getSummaries = async (docs: Document<Record<string, any>>[], chatLLM: ChatOllama) => {
    const summaryChain = RunnableSequence.from([
        { content: (doc: Document) => doc.pageContent },
        PromptTemplate.fromTemplate(`Summarize the following document:\n\n{content}`),
        chatLLM,
        new StringOutputParser(),
    ]);

    const summaries = await summaryChain.batch(docs, {
        maxConcurrency: 10,
    });
    const summaryDocs = summaries.map((summary, i) => {
        const summaryDoc = new Document({
            pageContent: summary,
            metadata: {
                source: docs[i].metadata.id,
                id: crypto.createHash('sha3-256').update(summary).digest('hex')
            },
        });
        return summaryDoc;
    });
    return summaryDocs;
};

export { getSummaries };