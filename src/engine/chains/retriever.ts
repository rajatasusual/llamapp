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
        const L2IndexThreshold = 400; // Example threshold for L2 distance, adjust as needed
        const CosineIndexThreshold = 0.4; // Example threshold for COSINE distance, adjust as needed
    
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
    
        //return only the relevant documents in an array. 
        const relevantDocuments = relevantResults.flat().map(result => result[0]);

        return relevantDocuments;
    
    }

    async _getRelevantDocuments(
      query: string,
      runManager?: CallbackManagerForRetrieverRun
    ): Promise<Document[]> {
      
      return this.getRelevantResults(await this.embeddings.embedQuery(query), this.vectorStores);
    }
  }