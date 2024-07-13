import {
    RunnableSequence,
} from "@langchain/core/runnables";

import { Document } from "@langchain/core/documents";
import { PromptTemplate } from "@langchain/core/prompts";
import { OllamaFunctions } from "@langchain/community/experimental/chat_models/ollama_functions";
import { OutputFixingParser, StructuredOutputParser } from "langchain/output_parsers";

import 'dotenv/config';
import { z } from "zod";
import { configureEnvironment } from "../config";

const { embeddings, client, chatLLM } = configureEnvironment();

const getHypotheticalQuestionDocs = async (docs: Document<Record<string, any>>[], idKey: string, docIds: string[]) => {
    const functionsSchema = [
        {
            name: "hypothetical_questions",
            description: "Generate hypothetical questions",
            parameters: {
                type: "object",
                properties: {
                    questions: {
                        type: "array",
                        items: {
                            type: "string",
                        },
                    },
                },
                required: ["questions"],
            },
        },
    ];

    const functionCallingModel = new OllamaFunctions({
        temperature: 0,
        model: "gemma:2b"
    }).bind({
        functions: functionsSchema,
        function_call: { name: "hypothetical_questions" },
    });

    const zodSchema = z.object({
        questions: z.array(z.string()).describe("Alternate questions"),
    });

    const parser = StructuredOutputParser.fromZodSchema(zodSchema);
    const parserWithFix = OutputFixingParser.fromLLM(chatLLM, parser);

    const hypotheticalQueriesChain = RunnableSequence.from([
        { content: (doc: Document) => doc.pageContent },
        PromptTemplate.fromTemplate(
            `Generate a list of 3 hypothetical questions that the below document could be used to answer:\n\n{content}`
        ),
        functionCallingModel,
        parserWithFix
    ]);

    const hypotheticalQuestions = await hypotheticalQueriesChain.batch(docs, {
        maxConcurrency: 5,
    }).catch((e) => {
        console.log(e);
        return [];
    });

    const hypotheticalQuestionDocs = hypotheticalQuestions
        .map((questionArray, i) => {
            const questionDocuments = questionArray.questions.map((question: any) => {
                const questionDocument = new Document({
                    pageContent: question,
                    metadata: {
                        [idKey]: docIds[i],
                    },
                });
                return questionDocument;
            });
            return questionDocuments;
        })
        .flat();

    return hypotheticalQuestionDocs;
}

export { getHypotheticalQuestionDocs };