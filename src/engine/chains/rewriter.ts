import { StructuredOutputParser } from 'langchain/output_parsers';
import {
    RunnableLike,
    RunnableSequence,
} from "@langchain/core/runnables";
import { z } from "zod";
import { PromptTemplate } from "@langchain/core/prompts";

/**
 * Rewrites a user's query to be better suited for a large language model.
 *
 * @param {any} question - The user's query to be rewritten.
 * @param {RunnableLike<any, any>} chatLLM - A runnable for the large language model.
 * @return {Promise<any>} The rephrased question as JSON.
 */
const rewrite = async (question: any, chatLLM: RunnableLike<any, any>) => {

    const schema = JSON.stringify({ "question": "Rephrased Question" });
    const example = JSON.stringify({ "question": "what is the reason for the blue color of the sky" });

    // We can use zod to define a schema for the output using the `fromZodSchema` method of `StructuredOutputParser`.
    const parser = StructuredOutputParser.fromZodSchema(
        z.object({
            question: z.string().describe("Rephrased question")
        })
    );

    const chain = RunnableSequence.from([
        PromptTemplate.fromTemplate(
            `You are an expert at prompt engineering for LLMs. 
Your job is to read a query and rephrase it to be better suited for a large language model. Do not include any other text in your response.
Do not add additional information in your alternate queries.
Return the answer as JSON in the format {schema}.\n
For example: {example}.

Here is the user's question (please rephrase and send ONLY JSON): {question}`

        ),
        chatLLM,
        parser,
    ]);
    try {
        const response = await chain.invoke({
            example,
            schema,
            question
        });
        
        console.log("Rephrased Question: " + response.question);

        return response.question;
    } catch (error) {
        console.log("Failed to rephrase question.");

        return question;
    }
};

export { rewrite };