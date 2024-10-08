import * as path from 'path';
import * as crypto from 'crypto';

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

	/**
	 * Constructs a new instance of the RelevantDocumentsRetriever class.
	 *
	 * @param {RelevantDocumentsRetrieverInput} fields - The input fields for the constructor.
	 * @return {void}
	 */
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

	/**
	 * Calculates the SHA3-256 hash of the given content.
	 *
	 * @param {string} content - The content to calculate the hash for.
	 * @return {string} The SHA3-256 hash of the content.
	 */
	calculateSHA3Hash(content: string): string {
		return crypto.createHash('sha3-256').update(content).digest('hex');
	}

	/**
	 * Creates a RedisVectorStore with the given indexName and keyPrefix.
	 *
	 * @param {string} indexName - The name of the index.
	 * @param {string} keyPrefix - The prefix for the keys.
	 * @return {RedisVectorStore} The created RedisVectorStore.
	 */
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

	/**
	 * Retrieves relevant results based on the embedded query.
	 *
	 * @param {number[]} embeddedQuery - The embedded query for similarity search.
	 * @return {any[]} Relevant documents extracted from the search results.
	 */
	async getRelevantResults(embeddedQuery: number[]) {

		// Define relevance thresholds
		const L2IndexThreshold = process.env.L2_INDEX_THRESHOLD || "400"; // Example threshold for L2 distance, adjust as needed
		const CosineIndexThreshold = process.env.COSINE_INDEX_THRESHOLD || "0.4"; // Example threshold for COSINE distance, adjust as needed

		const relevantResults: any[] = [];

		/**
		 * Retrieves relevant results based on the embedded query.
		 *
		 * @param {RedisVectorStore} store - The store to retrieve documents from.
		 * @return {Promise<any[]>} An array of relevant documents extracted from the search results.
		 */
		const findRelevantDocuments = async (store: RedisVectorStore) => {
			try {
				const retrievedDocuments = await store.similaritySearchVectorWithScore(embeddedQuery, 10);

				switch (store.indexOptions.DISTANCE_METRIC) {
					case "L2":
						return retrievedDocuments.filter(result => result[1] <= Number.parseFloat(L2IndexThreshold));

					case "COSINE":
						return retrievedDocuments.filter(result => result[1] <= Number.parseFloat(CosineIndexThreshold));

					default:
						return retrievedDocuments;
				}
			} catch (error) {
				console.error(error);
				return [];
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

	/**
	 * Add a new document to the storage.
	 *
	 * @param {Document<Record<string, any>>} doc - The main document to be added.
	 * @param {Document<Record<string, any>>[]} subDocs - Additional sub-documents to be added.
	 * @return {Promise<string>} The ID of the added document.
	 */
	async addDocument(doc: Document<Record<string, any>>, subDocs: Document<Record<string, any>>[]) {
		const encoder = new TextEncoder();

		if (doc.id === undefined)
			doc.id = this.calculateSHA3Hash(doc.pageContent);

		// Check if the hash already exists
		const existingDoc = await this.filesStore.mget([doc.id]);
		if (existingDoc && existingDoc.length > 0 && existingDoc[0] !== undefined) {
			console.log("File already exists, skipping document creation.");
			return 0;
		}

		const fileContent = JSON.stringify({
			pageContent: doc.pageContent,
			metadata: doc.metadata
		});
		const keyValuePair: [string, Uint8Array] = [
			doc.id,
			Uint8Array.from(encoder.encode(fileContent))
		];
		fs.existsSync(this.filesStore.rootPath) || fs.mkdirSync(this.filesStore.rootPath, { recursive: true });

		const worthSummarizing = ['.js', '.html', '.ts', '.md', '.pdf']
			.includes(
				path.extname(doc.metadata.source)
			) ? subDocs.filter((doc) => doc.pageContent.length > 400) : [];

		const summaries = worthSummarizing.length > 0 ? await getSummaries(worthSummarizing, this.chatLLM) : [];

		await this.filesStore.mset([keyValuePair]);
		await this.subDocsStore.addDocuments(subDocs);
		worthSummarizing.length > 0 && await this.summariesStore.addDocuments(summaries);

		return doc.id;
	}

	/**
	 * Retrieves relevant documents based on the query.
	 *
	 * @param {string} query - The query string to retrieve relevant documents.
	 * @param {CallbackManagerForRetrieverRun} [runManager] - Optional callback manager for retriever run.
	 * @return {Promise<Document[]>} The relevant documents retrieved.
	 */
	async _getRelevantDocuments(
		query: string,
		runManager?: CallbackManagerForRetrieverRun
	): Promise<Document[]> {
		const relevantDocuments = await this.getRelevantResults(await this.embeddings.embedQuery(query));

		return relevantDocuments;
	}
}