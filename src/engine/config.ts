import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { RedisVectorStore } from "@langchain/redis";
import { VectorAlgorithms, createClient } from "redis";


const configureEnvironment = () => {
    const client = createClient({
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
    client.connect();

    const embeddings = new OllamaEmbeddings({
        model: process.env.EMBEDDING_MODEL, // default value
        baseUrl: process.env.BASE_URL, // default value
    });
    const chatLLM = new ChatOllama({
        baseUrl: process.env.BASE_URL, // Default value
        model: process.env.CHAT_MODEL, // Default value
        temperature: 0
    });

    const documentStore = new RedisVectorStore(embeddings, {
        redisClient: client,
        indexName: "docs",
        keyPrefix: "doc",
        indexOptions: {
            ALGORITHM: VectorAlgorithms.HNSW,
            DISTANCE_METRIC: "COSINE"
        },
        createIndexOptions: {
            ON: "HASH",
            NOHL: true,
            
        },
    });

    const apiStore = new RedisVectorStore(embeddings, {
        redisClient: client,
        indexName: "api",
        keyPrefix: "api",
        indexOptions: {
            ALGORITHM: VectorAlgorithms.HNSW,
            DISTANCE_METRIC: "L2"
        },
        createIndexOptions: {
            ON: "HASH",
            NOHL: true
        },
    });

    return { chatLLM, documentStore, apiStore, embeddings };
};

export { configureEnvironment };