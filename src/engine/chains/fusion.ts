import { Document } from "langchain/document";
import {
    RunnableLike,
    RunnableSequence,
} from "@langchain/core/runnables";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { PromptTemplate } from "@langchain/core/prompts";
import { RelevantDocumentsRetriever } from "./retriever";

//supporting functions:

//generate alternate queries based on the user's original query:
async function generateQueries(options: { query: string; model: RunnableLike<any, any>; }) {

    const { query, model } = options;

    // We can use zod to define a schema for the output using the `fromZodSchema` method of `StructuredOutputParser`.
    const parser = StructuredOutputParser.fromZodSchema(
        z.object({
            question: z.array(z.string()).describe("Alternate questions")
        })
    );

    const schema = JSON.stringify({
        "question": [
            "Alternate Question 1",
            "Alternate Question 2",
            "Alternate Question 3",
            "Alternate Question 4",
        ]
    });

    const chain = RunnableSequence.from([
        PromptTemplate.fromTemplate(
            `You are a helpful assistant that generates alternative queries 
that could be asked to a large language model related to the users original query.
Return the answer as JSON in the format as {schema}
\n\n
Please generate minimum 2 alternate queries and send ONLY JSON as per the schema.
Otherwise, you will receive an error. Do not include any other text in your response.
Do not add additional information in your alternate queries.
Now, Here is the question you need to generate alternate queries for :
\n\n
{query}`
        ),
        model,
        parser,
    ]);
    try {
        const response = await chain.invoke({
            schema, query
        });

        return response.question;
    } catch (error) {
        console.log("Failed to provide alternate questions.");

        return [query];
    }
}

const fusion = async (options: { query: string; chatLLM: any; retriever: RelevantDocumentsRetriever }) => {

    const { query, chatLLM, retriever } = options;

    const FUSION_THRESHOLD = process.env.FUSION_THRESHOLD || "0.1";

    //generate alternate queries based on the user's original query:
    const generatedQueries = await generateQueries({ query, model: chatLLM });

    console.log("Generated Alternate Queries: ", generatedQueries);
    generatedQueries.push(query);

    //get the documents that most closely relate to each alternate generated query...
    let altQueryDocs: any[] = [];
    for (const generatedQuery of generatedQueries) {
        altQueryDocs.push(await retriever._getRelevantDocuments(generatedQuery));
    };

    //apply the reciprocal rank fusion algorithm...
    const rankedResults: Document[] = reciprocalRankFusion(altQueryDocs);

    return rankedResults.filter((doc: any) => doc.metadata.score > Number.parseFloat(FUSION_THRESHOLD));
}

//apply the RRF algorithm to the docs, merge any similarities, and return the top results in a single object (fusedScores)
const reciprocalRankFusion = (results: Document[][]) => {

    const fusedScores: Record<string, number> = {};
    const flatResults = results.flat();

    const k = flatResults.length;

    let docsSet = flatResults.reduce(function (map: any, obj) {
        map[JSON.stringify(obj.metadata)] = obj.pageContent;
        return map;
    }, {});

    for (const result of results) {
        // Assumes the docs are returned in sorted order of relevance
        result.forEach((item, index) => {
            const docId = JSON.stringify(item.metadata);
            if (!(docId in fusedScores)) {
                fusedScores[docId] = 0;
            }
            fusedScores[docId] += 1 / (index + k);
        });
    }

    const rerankedResults = Object.entries(fusedScores)
        .sort((a, b) => b[1] - a[1])
        .map(
            ([id, score]) => new Document({ id, pageContent: docsSet[id], metadata: { ...JSON.parse(id), score } })
        );

    return rerankedResults;
};
//end rrf function

export { generateQueries, reciprocalRankFusion, fusion };