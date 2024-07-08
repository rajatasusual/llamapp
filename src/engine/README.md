# Llamapp RAG Engine

## Overview

The RAG Engine is the core component of the Llamapp Retrieval Augmented Generator (RAG) project. It encompasses functionalities for document retrieval, query rewriting, and result fusion to provide accurate and contextually relevant responses using the LangChain framework. The engine is designed to minimize hallucinations and enhance response quality by leveraging embeddings and custom retrieval algorithms.

## Components

1. **Fusion:** Uses the Reciprocal Rank Fusion (RRF) algorithm to determine the most relevant documents from alternative queries.
2. **Retriever:** Custom retriever to fetch relevant documents from Redis vector stores using embeddings.
3. **Rewriter:** Rewrites user queries for clarity and focus.

## Prerequisites

- **Node.js**: Ensure you have Node.js installed.
- **Redis**: Set up a local instance of Redis.
- **Ollama Model**: Download and configure the Ollama Gemma:2b model for local usage.

## Components Overview

### Fusion


#### Supporting Functions

##### `generateQueries` Function

This function generates alternate queries based on the user’s original query.

 1. **Parameters:**
   - `query`: The original query provided by the user.
   - `model`: The model used to generate the alternate queries.

 2. **Schema Definition:**
   - Uses `zod` to define the schema for the output, expecting an array of strings for alternate questions.

 3. **Prompt and Sequence:**
   - Creates a prompt template instructing the model to generate alternate queries in JSON format.
   - Combines the prompt template, model, and parser into a sequence (`RunnableSequence`).

 4. **Invocation:**
   - Invokes the sequence with the query and schema, attempting to generate and return alternate questions.
   - If the process fails, it logs an error and returns the original query.

##### `fusion` Function

This function applies the Reciprocal Rank Fusion (RRF) algorithm to retrieve and rank relevant documents based on the original and generated queries.

 1. **Parameters:**
   - `query`: The original query.
   - `chatLLM`: The language model used for generating queries and retrieving documents.
   - `retriever`: An instance of `RelevantDocumentsRetriever` to fetch relevant documents.

 2. **Threshold:**
   - Uses `FUSION_THRESHOLD` to filter documents based on their score.

 3. **Generating Alternate Queries:**
   - Calls `generateQueries` to produce alternate versions of the original query.
   - Logs and appends the original query to the list of generated queries.

 4. **Retrieving Documents:**
   - Retrieves relevant documents for each generated query using the retriever.
   - Collects these documents into `altQueryDocs`.

 5. **Applying RRF:**
   - Calls `reciprocalRankFusion` to rank and merge the retrieved documents.
   - Filters and returns documents with scores above the threshold.

##### `reciprocalRankFusion` Function

This function implements the Reciprocal Rank Fusion algorithm to combine and rank documents retrieved for different queries.

1. **Parameters:**
   - `results`: A list of lists of documents, where each inner list corresponds to documents retrieved for a query.

2. **Initialization:**
   - Initializes `fusedScores` to store the combined scores of documents.
   - Flattens the results and prepares a unique set of documents.

3. **Scoring:**
   - Iterates through the results, updating the scores for each document based on their ranks.
   - The score for each document is increased by `1 / (index + k)`, where `index` is the document’s position in the list, and `k` is the total number of documents.

4. **Re-ranking:**
   - Sorts documents by their combined scores in descending order.
   - Maps the sorted documents to `Document` objects, including their metadata and scores.

5. **Return:**
   - Returns the re-ranked list of documents.

#### Summary

The additional code supports the main functionality by generating alternate queries, retrieving and ranking relevant documents using RRF, and filtering the top results. The `generateQueries` function creates multiple variations of the original query, the `fusion` function orchestrates the retrieval and fusion process, and the `reciprocalRankFusion` function combines and ranks documents based on their relevance to the queries.

##### Usage

```javascript
import { fusion } from './path/to/fusion';

const options = {
  query: "How do I set up a local server?",
  chatLLM: yourLLMInstance,
  retriever: yourRetrieverInstance
};

const rankedDocuments = await fusion(options);
console.log(rankedDocuments);
```

### Retriever

##### Class

- **`RelevantDocumentsRetriever`**: Custom retriever to fetch relevant documents from Redis vector stores using embeddings.

I understand the additional code snippet you’ve shared. Here's a breakdown:

### `RelevantDocumentsRetriever` Class

This class extends `BaseRetriever` and is designed to retrieve relevant documents from multiple Redis vector stores using embeddings.

#### Properties and Constructor

1. **Properties:**
   - `vectorStores`: An array of `RedisVectorStore` instances.
   - `embeddings`: An instance of `OllamaEmbeddings`.

2. **Constructor:**
   - Initializes the `vectorStores` and `embeddings` properties with the provided inputs or defaults.
   - Calls the superclass constructor (`super(fields)`).

#### Methods

##### `getRelevantResults`

This method retrieves relevant documents from the vector stores based on the embedded query.

1. **Parameters:**
   - `embeddedQuery`: The query represented as an embedding (a numerical vector).
   - `vectorStores`: An array of `RedisVectorStore` instances to search in.

2. **Thresholds:**
   - Defines thresholds for relevance based on the distance metric (L2 or COSINE).

3. **Finding Relevant Documents:**
   - Defines a helper function `findRelevantDocuments` that:
     - Performs a similarity search in the vector store.
     - Filters the results based on the store's distance metric and the defined thresholds.

4. **Retrieving and Filtering Documents:**
   - Iterates over each vector store, retrieves relevant documents using `findRelevantDocuments`, and catches any errors.
   - Flattens the results and maps them to extract only the document objects.

5. **Return:**
   - Returns an array of relevant documents.

##### `_getRelevantDocuments`

This is an internal method that uses the `getRelevantResults` method to retrieve documents based on a query.

1. **Parameters:**
   - `query`: The original query string.
   - `runManager`: An optional callback manager for handling retriever runs.

2. **Process:**
   - Embeds the query using the `embeddings` instance.
   - Calls `getRelevantResults` with the embedded query and vector stores.
   - Returns the retrieved relevant documents.

### Summary

The `RelevantDocumentsRetriever` class is responsible for finding and retrieving documents relevant to a given query from multiple Redis vector stores using a specified embedding model. It filters results based on predefined thresholds for different distance metrics, ensuring that only the most relevant documents are returned. The `_getRelevantDocuments` method embeds the query, retrieves the relevant documents, and returns them.

#### Usage

```javascript
import { RelevantDocumentsRetriever } from './path/to/retriever';
import { RedisVectorStore } from '@langchain/redis';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';

const documentStore = new RedisVectorStore(/* your configuration */);
const apiStore = new RedisVectorStore(/* your configuration */);
const embeddings = new OllamaEmbeddings();

const retriever = new RelevantDocumentsRetriever({
  vectorStores: [documentStore, apiStore],
  embeddings
});

const query = "Your query here";
const relevantDocuments = await retriever._getRelevantDocuments(query);
console.log(relevantDocuments);
```

### Rewriter

#### Functions

- **`enrichMessage`**: Enriches the user query based on previous context and messages.

#### Usage

```javascript
import { enrichMessage } from './path/to/rewriter';

const previousMessage = {
  context: [/* previous document contexts */],
  answer: "Previous answer",
  additionalInfo: { input: "Previous question" }
};

const question = "Your new question here";
const enrichedQuestion = enrichMessage(previousMessage, question);
console.log(enrichedQuestion);
```

## Running the Engine

To utilize the engine, you can integrate the fusion, retriever, and rewriter functionalities as shown in the examples above. Here’s a brief example demonstrating how to combine these components:

```javascript
import { fusion } from './path/to/fusion';
import { RelevantDocumentsRetriever } from './path/to/retriever';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { RedisVectorStore } from '@langchain/redis';
import { enrichMessage } from './path/to/rewriter';

// Configure vector stores and embeddings
const documentStore = new RedisVectorStore(/* your configuration */);
const apiStore = new RedisVectorStore(/* your configuration */);
const embeddings = new OllamaEmbeddings();

const retriever = new RelevantDocumentsRetriever({
  vectorStores: [documentStore, apiStore],
  embeddings
});

const query = "How do I set up a local server?";

// Enrich the query if needed
const enrichedQuery = enrichMessage(previousMessage, query);

// Perform fusion to get the most relevant documents
const rankedDocuments = await fusion({
  query: enrichedQuery,
  chatLLM: yourLLMInstance,
  retriever
});

// Process the ranked documents as needed
console.log(rankedDocuments);
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any improvements or bugs you find.

## License

This project is licensed under the MIT License.