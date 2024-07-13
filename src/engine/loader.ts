import * as uuid from "uuid";
import * as path from 'path';
import * as fs from 'fs';

import ignore from 'ignore';

import { HtmlToTextTransformer } from "@langchain/community/document_transformers/html_to_text";
import { Document } from "langchain/document";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HTMLLoader } from "./loaders/HTMLLoader";
import { PostmanLoader } from "./loaders/PostmanLoader";
import { RelevantDocumentsRetriever } from "./retriever";

const loadJSONDoc = async (file: string | Blob) => {
    const jsonLoader = new JSONLoader(file);
    const expertDocs = await jsonLoader.load();

    return expertDocs;
}

const loadHTMLDoc = async (file: string | Blob) => {
    const htmlLoader = new HTMLLoader(file);
    const subDocs = await htmlLoader.load();

    const splitter = RecursiveCharacterTextSplitter.fromLanguage("html");
    const transformer = new HtmlToTextTransformer();

    const sequence = splitter.pipe(transformer);

    const transformedDocs = await sequence.invoke(subDocs);

    //add id to each document
    for (let i = 0; i < transformedDocs.length; i++) {
        transformedDocs[i].metadata = { ...transformedDocs[i].metadata, id: uuid.v4() };
    }

    return transformedDocs;
}

const loadPostmanCollection = async (file: string | Blob) => {
    const postmanLoader = new PostmanLoader(file);
    const jsonDoc = await postmanLoader.load();

    return jsonDoc;
}

const readDirectorySync = async (dirPath: string, retriever: RelevantDocumentsRetriever) => {
    const ig = ignore();

    // Check if .gitignore exists and add its rules to the ignore instance
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(gitignoreContent);
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (ig.ignores(path.relative(dirPath, itemPath))) {
            continue; // Skip ignored files and directories
        }

        if (stat.isDirectory()) {
            await readDirectorySync(itemPath, retriever);
        } else {
            const ext = path.extname(item);
            if (['.js', '.html', '.ts', '.env', '.md', '.json'].includes(ext)) {
                await fetchDocument(itemPath, retriever);
            }
        }
    }
}

const fetchDocument = async (filePath: string, retriever: RelevantDocumentsRetriever) => {

    console.log(`Loading ${filePath}`);

    const time = Date.now();
    const textLoader = new TextLoader(filePath);
    const parentDoc: Document<Record<string, any>> = (await textLoader.load())[0];

    await addDocument(parentDoc, retriever)

    console.log(`Loaded ${filePath.split(path.sep).pop()} in ${Date.now() - time} ms`);
}

const addDocument = async (doc: Document<Record<string, any>>, retriever: RelevantDocumentsRetriever) => {
    const docs = await prepareDocument(doc);

    await retriever.addDocument(doc, docs);

}

const prepareDocument = async (parentDocument: Document<Record<string, any>>) => {

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
    });

    const docs = await splitter.splitDocuments([parentDocument]);

    const docIds = docs.map((_) => uuid.v4());

    const childSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 400,
        chunkOverlap: 0,
    });

    const subDocs = [];
    for (let i = 0; i < docs.length; i += 1) {
        const childDocs = await childSplitter.splitDocuments([docs[i]]);
        const taggedChildDocs = childDocs.map((childDoc) => {
            // eslint-disable-next-line no-param-reassign
            childDoc.metadata["source"] = docIds[i];
            return childDoc;
        });
        subDocs.push(...taggedChildDocs);
    }


    const source = uuid.v4();

    docs.map((doc) => {
        doc.metadata = { ...doc.metadata, source, id: uuid.v4() };
    });

    parentDocument.id = source;

    return docs;

}


export { loadJSONDoc, loadHTMLDoc, loadPostmanCollection, readDirectorySync, fetchDocument, addDocument };

