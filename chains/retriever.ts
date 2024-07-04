import { RedisVectorStore } from '@langchain/redis';
import { Document } from 'langchain/document';

const retrieve = async (question: any, vectorStores: RedisVectorStore[]) => {

    const relevantDocuments = getRelevantResults(question.embeddedQuery, vectorStores);

    return relevantDocuments;
};

async function getRelevantResults(embeddedQuery: number[], vectorStores: RedisVectorStore[]) {

    // Define relevance thresholds
    const L2IndexThreshold = process.env.L2_INDEX_THRESHOLD ?
        parseFloat(process.env.L2_INDEX_THRESHOLD) : 400; // Example threshold for L2 distance, adjust as needed
    const CosineIndexThreshold = process.env.COSINE_INDEX_THRESHOLD ?
        parseFloat(process.env.COSINE_INDEX_THRESHOLD) : 4; // Example threshold for COSINE distance, adjust as needed

    const relevantResults: any[] = [];

    const findRelevantDocuments = async (store: RedisVectorStore) => {
        switch (store.indexOptions.DISTANCE_METRIC) {
            case "L2":
                relevantResults.push(
                    (await store.similaritySearchVectorWithScore(embeddedQuery, 10))
                        .filter(result => result[1] <= L2IndexThreshold)
                );
                break;
            case "COSINE":
                relevantResults.push(
                    (await store.similaritySearchVectorWithScore(embeddedQuery, 10))
                        .filter(result => result[1] <= CosineIndexThreshold)
                );
                break;
            default:
                break;
        }
    };

    for (const store of vectorStores) {
        await findRelevantDocuments(store);
    };

    const relevantDocuments: Document[] = relevantResults.flat();
    return relevantDocuments;

}

export { retrieve };