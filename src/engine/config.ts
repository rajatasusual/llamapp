import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { RedisVectorStore } from "@langchain/redis";
import { LocalFileStore } from "langchain/storage/file_system";

import { createClient, RedisClientType, VectorAlgorithms } from "redis";
import * as fs from 'fs';

import { RelevantDocumentsRetriever } from "./retriever";

const configureEnvironment = () => {
    const client: RedisClientType = createClient({
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
    client.connect();

    client.del('messages');

    if (fs.existsSync('output.jsonl'))
        fs.truncateSync('output.jsonl');

    const embeddings = new OllamaEmbeddings({
        model: process.env.EMBEDDING_MODEL, // default value
        baseUrl: process.env.BASE_URL, // default value
    });
    const chatLLM = new ChatOllama({
        baseUrl: process.env.BASE_URL, // Default value
        model: process.env.CHAT_MODEL, // Default value
        temperature: process.env.CHAT_TEMPERATURE && parseFloat(process.env.CHAT_TEMPERATURE) || 0, // Default value
    });

    const subDocsStore = new RedisVectorStore(embeddings, {
        redisClient: client,
        indexName: "subDocs",
        keyPrefix: "sub",
        indexOptions: {
            ALGORITHM: VectorAlgorithms.HNSW,
            DISTANCE_METRIC: "COSINE"
        },
        createIndexOptions: {
            ON: "HASH",
            NOHL: true,

        },
    });

    const summariesStore = new RedisVectorStore(embeddings, {
        redisClient: client,
        indexName: "summaries",
        keyPrefix: "sum",
        indexOptions: {
            ALGORITHM: VectorAlgorithms.HNSW,
            DISTANCE_METRIC: "COSINE"
        },
        createIndexOptions: {
            ON: "HASH",
            NOHL: true,

        },
    });

    // The fileStore to use to store the original chunks
    let fileStore: LocalFileStore = new LocalFileStore({
        rootPath: "./storage",
    });

    const retriever = new RelevantDocumentsRetriever({
        subDocsStore,
        summariesStore,
        fileStore,
        client,
        embeddings,
        chatLLM
    })
    return { chatLLM, retriever, embeddings, client };
};

export { configureEnvironment };