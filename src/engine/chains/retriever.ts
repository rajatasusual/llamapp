import {
  BaseRetriever,
  type BaseRetrieverInput,
} from "@langchain/core/retrievers";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
import { Document } from "@langchain/core/documents";
import { RedisVectorStore } from "@langchain/redis";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";

export interface RelevantDocumentsRetrieverInput extends BaseRetrieverInput {
  vectorStores: RedisVectorStore[];
  embeddings: OllamaEmbeddings;
}

export class RelevantDocumentsRetriever extends BaseRetriever {

  lc_namespace = ["langchain", "retrievers"];

  vectorStores: RedisVectorStore[] = [];
  embeddings: OllamaEmbeddings;

  constructor(fields?: RelevantDocumentsRetrieverInput) {
    super(fields);

    this.vectorStores = fields?.vectorStores ?? [];
    this.embeddings = fields?.embeddings ?? new OllamaEmbeddings();
  }

  async getRelevantResults(embeddedQuery: number[], vectorStores: RedisVectorStore[]) {

    // Define relevance thresholds
    const L2IndexThreshold = process.env.L2_INDEX_THRESHOLD || "400"; // Example threshold for L2 distance, adjust as needed
    const CosineIndexThreshold = process.env.COSINE_INDEX_THRESHOLD || "0.4"; // Example threshold for COSINE distance, adjust as needed

    const relevantResults: any[] = [];

    const findRelevantDocuments = async (store: RedisVectorStore) => {
      const retrievedDocuments = await store.similaritySearchVectorWithScore(embeddedQuery, 10);

      switch (store.indexOptions.DISTANCE_METRIC) {
        case "L2":
          return retrievedDocuments.filter(result => result[1] >= Number.parseFloat(L2IndexThreshold));

        case "COSINE":
          return retrievedDocuments.filter(result => result[1] >= Number.parseFloat(CosineIndexThreshold));
          
        default:
          return retrievedDocuments;
      }
    };

    for (const store of vectorStores) {
      try {
        relevantResults.push(await findRelevantDocuments(store));
      } catch (err) {
        console.log(err);
      }
    };

    //return only the relevant documents in an array. 
    const relevantDocuments = relevantResults.flat().map(result => result[0]);

    return relevantDocuments;

  }

  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    const relevantDocuments = await this.getRelevantResults(await this.embeddings.embedQuery(query), this.vectorStores);

    return relevantDocuments;
  }
}