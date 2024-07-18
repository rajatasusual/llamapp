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

/**
 * Loads a JSON document from the given file or Blob and returns the loaded documents.
 *
 * @param {string | Blob} file - The file or Blob containing the JSON document.
 * @return {Promise<Document[]>} A promise that resolves to an array of loaded documents.
 */
const loadJSONDoc = async (file: string | Blob) => {
    const jsonLoader = new JSONLoader(file);
    const expertDocs = await jsonLoader.load();

    return expertDocs;
}

/**
 * Loads an HTML document from the given file or Blob, splits it into sub-documents,
 * transforms each sub-document into plain text, and adds a unique ID to each transformed document.
 *
 * @param {string | Blob} file - The file or Blob containing the HTML document.
 * @return {Promise<Document[]>} A promise that resolves to an array of transformed documents.
 */
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

/**
 * Loads a Postman collection from the given file or Blob and returns the loaded JSON document.
 *
 * @param {string | Blob} file - The file or Blob containing the Postman collection.
 * @return {Promise<Document>} A promise that resolves to the loaded JSON document.
 */
const loadPostmanCollection = async (file: string | Blob) => {
    const postmanLoader = new PostmanLoader(file);
    const jsonDoc = await postmanLoader.load();

    return jsonDoc;
}

/**
 * Reads a directory synchronously and recursively fetches documents from relevant files.
 *
 * @param {string} dirPath - The path of the directory to read.
 * @param {RelevantDocumentsRetriever} retriever - The retriever instance to fetch documents.
 * @return {Promise<void>} A promise that resolves when the directory has been read.
 */
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

/**
 * Fetches a document from a specified file path, processes it, and adds it to the retriever.
 *
 * @param {string} filePath - The path to the document file
 * @param {RelevantDocumentsRetriever} retriever - The retriever to add the document to
 * @param {any} loader - The loader type for processing the document (default: TextLoader)
 * @return {Promise<string>} The ID of the added document
 */
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

/**
 * Adds a document to the retriever after preparing the document.
 *
 * @param {Document<Record<string, any>>} doc - The document to be added
 * @param {RelevantDocumentsRetriever} retriever - The retriever to add the document to
 * @return {Promise<any>} The result of adding the document to the retriever
 */
const addDocument = async (doc: Document<Record<string, any>>, retriever: RelevantDocumentsRetriever) => {
    const docs = await prepareDocument(doc);

    return await retriever.addDocument(doc, docs);

}

/**
 * Prepares a parent document by splitting it into smaller documents using a RecursiveCharacterTextSplitter,
 * generating a source hash for the parent document and its chunks, and updating the metadata of each chunk.
 * Finally, sets the id of the parent document to the source hash.
 *
 * @param {Document<Record<string, any>>} parentDocument - The parent document to be prepared.
 * @return {Promise<Document<Record<string, any>>[]>} An array of prepared documents.
 */
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

