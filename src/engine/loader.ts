import * as crypto from 'crypto';

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
        transformedDocs[i].metadata = {
            ...transformedDocs[i].metadata,
            id: crypto.createHash('sha3-256').update(transformedDocs[i].pageContent).digest('hex')
        };
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

const fetchDocument = async (filePath: string, retriever: RelevantDocumentsRetriever, loader: any = TextLoader) => {

    console.log(`Loading ${filePath}`);

    const time = Date.now();
    const fileLoader = new loader(filePath);
    const parentDoc: Document<Record<string, any>> = (await fileLoader.load())[0];

    const docId = await addDocument(parentDoc, retriever);

    if (docId) {
        console.log(`Loaded ${filePath.split(path.sep).pop()} in ${Date.now() - time} ms`);
    }
    fs.unlinkSync(filePath); // Delete the file after processing

    return docId;
}

const addDocument = async (doc: Document<Record<string, any>>, retriever: RelevantDocumentsRetriever) => {
    const docs = await prepareDocument(doc);

    return await retriever.addDocument(doc, docs);

}

const prepareDocument = async (parentDocument: Document<Record<string, any>>) => {

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
    });

    const docs = await splitter.splitDocuments([parentDocument]);

    const source = crypto.createHash('sha3-256').update(parentDocument.pageContent).digest('hex');

    docs.map((doc) => {
        doc.metadata = {
            ...doc.metadata, source,
            id: crypto.createHash('sha3-256').update(doc.pageContent).digest('hex')
        };
    });

    parentDocument.id = source;

    return docs;

}


export { loadJSONDoc, loadHTMLDoc, loadPostmanCollection, readDirectorySync, fetchDocument, addDocument };

