import * as uuid from "uuid";
import * as path from 'path';

import {
	BaseRetriever,
	type BaseRetrieverInput,
} from "@langchain/core/retrievers";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
import { Document } from "@langchain/core/documents";
import { RedisVectorStore } from "@langchain/redis";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { LocalFileStore } from "langchain/storage/file_system";

import { createClient, RedisClientType, VectorAlgorithms } from "redis";

import * as fs from 'fs';
import { getSummaries } from "./chains/summary";
import { ChatOllama } from "@langchain/community/chat_models/ollama";

export interface RelevantDocumentsRetrieverInput extends BaseRetrieverInput {
	client: RedisClientType;

	summariesStore: RedisVectorStore;
	subDocsStore: RedisVectorStore;
	fileStore: LocalFileStore;

	embeddings: OllamaEmbeddings;

	chatLLM: ChatOllama;
}

export class RelevantDocumentsRetriever extends BaseRetriever {

	lc_namespace = ["langchain", "retrievers"];

	summariesStore: RedisVectorStore;
	subDocsStore: RedisVectorStore;
	filesStore: LocalFileStore;

	client: RedisClientType;

	embeddings: OllamaEmbeddings;
	chatLLM: ChatOllama;

	constructor(fields: RelevantDocumentsRetrieverInput) {
		super(fields);

		this.embeddings = fields?.embeddings ?? new OllamaEmbeddings({
			model: process?.env.EMBEDDING_MODEL, // default value
			baseUrl: process?.env.BASE_URL, // default value
		});

		this.client = fields?.client ?? createClient({
			url: process.env.REDIS_URL ?? "redis://localhost:6379",
		});

		this.subDocsStore = fields?.subDocsStore ?? this.createRedisStore("subDocs", "sub");
		this.summariesStore = fields?.summariesStore ?? this.createRedisStore("summaries", "sum");
		this.filesStore = fields?.fileStore ?? new LocalFileStore({ rootPath: "storage" });

		this.chatLLM = fields?.chatLLM ?? new ChatOllama({
			baseUrl: process.env.BASE_URL, // Default value
			model: process.env.CHAT_MODEL, // Default value
			temperature: process.env.CHAT_TEMPERATURE && parseFloat(process.env.CHAT_TEMPERATURE) || 0, // Default value
		});

	}

	createRedisStore(indexName: string, keyPrefix: string) {
		return new RedisVectorStore(this.embeddings, {
			redisClient: this.client,
			indexName,
			keyPrefix,
			indexOptions: {
				ALGORITHM: VectorAlgorithms.HNSW,
				DISTANCE_METRIC: "COSINE"
			},
			createIndexOptions: {
				ON: "HASH",
				NOHL: true,

			},
		});
	}

	async getRelevantResults(embeddedQuery: number[]) {

		// Define relevance thresholds
		const L2IndexThreshold = process.env.L2_INDEX_THRESHOLD || "400"; // Example threshold for L2 distance, adjust as needed
		const CosineIndexThreshold = process.env.COSINE_INDEX_THRESHOLD || "0.4"; // Example threshold for COSINE distance, adjust as needed

		const relevantResults: any[] = [];

		const findRelevantDocuments = async (store: RedisVectorStore) => {
			const retrievedDocuments = await store.similaritySearchVectorWithScore(embeddedQuery, 10);

			switch (store.indexOptions.DISTANCE_METRIC) {
				case "L2":
					return retrievedDocuments.filter(result => result[1] <= Number.parseFloat(L2IndexThreshold));

				case "COSINE":
					return retrievedDocuments.filter(result => result[1] <= Number.parseFloat(CosineIndexThreshold));

				default:
					return retrievedDocuments;
			}
		};

		const summaryResults = await findRelevantDocuments(this.summariesStore);
		const subDocResults = await findRelevantDocuments(this.subDocsStore);

		// remove all the subDocs from the subDocResults that are already in the summaryResults
		const filteredSubDocResults = subDocResults
			.filter((result) => !summaryResults.some(
				(summaryResult) => summaryResult[0].metadata.source === result[0].metadata.id)
			);

		relevantResults.push(summaryResults, filteredSubDocResults);

		//return only the relevant documents in an array. 
		const relevantDocuments = relevantResults.flat().map(result => result[0]);

		return relevantDocuments;

	}

	async addDocument(doc: Document<Record<string, any>>, subDocs: Document<Record<string, any>>[]) {
		const encoder = new TextEncoder();

		if (doc.id === undefined)
			doc.id = uuid.v4();

		const keyValuePair: [string, Uint8Array] = [
			doc.id,
			Uint8Array.from(encoder.encode(JSON.stringify({
				pageContent: doc.pageContent,
				metadata: doc.metadata
			})))
		];

		const worthSummarizing = ['.js', '.html', '.ts', '.md'].includes(
			path.extname(doc.metadata.source)
		) ? subDocs.filter((doc) => doc.pageContent.length > 400) : [];

		const summaries = worthSummarizing.length > 0 ? await getSummaries(worthSummarizing, this.chatLLM) : [];

		fs.existsSync(this.filesStore.rootPath) || fs.mkdirSync(this.filesStore.rootPath, { recursive: true });

		// Use the retriever to add the original chunks to the document store
		await this.filesStore.mset([keyValuePair]);
		await this.subDocsStore.addDocuments(subDocs);
		worthSummarizing.length > 0 && await this.summariesStore.addDocuments(summaries);
	}

	async _getRelevantDocuments(
		query: string,
		runManager?: CallbackManagerForRetrieverRun
	): Promise<Document[]> {
		const relevantDocuments = await this.getRelevantResults(await this.embeddings.embedQuery(query));

		/*
		const docs = await this.filesStore.mget(relevantDocuments.map((doc) => doc.metadata.id));
	
		const decoder = new TextDecoder();
	
		const docsJson = docs.filter((doc) => doc !== null && doc !== undefined).map((doc) => JSON.parse(decoder.decode(doc)));
		const relevantDocs = docsJson.map((doc: { pageContent: any; metadata: any; }) => new Document({ pageContent: doc.pageContent, metadata: doc.metadata }));
		*/
		return relevantDocuments;
	}
}