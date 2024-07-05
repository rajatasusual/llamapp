import { HtmlToTextTransformer } from "@langchain/community/document_transformers/html_to_text";
import { Document } from "langchain/document";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HTMLLoader } from "./loaders/HTMLLoader";
import { PostmanLoader } from "./loaders/PostmanLoader";

const CHUNK_SIZE = 1000;

const loadJSONDoc = async (file: string | Blob) => {
    const jsonLoader = new JSONLoader(file);
    const expertDocs = await jsonLoader.load();

    return expertDocs;
}

const loadHTMLDoc = async (file: string | Blob) => {
    const htmlLoader = new HTMLLoader(file);
    const htmlDoc = await htmlLoader.load();

    const splitter = RecursiveCharacterTextSplitter.fromLanguage("html");
    const transformer = new HtmlToTextTransformer();

    const sequence = splitter.pipe(transformer);

    const transformedDoc = await sequence.invoke(htmlDoc);

    return transformedDoc;
}

const loadPostmanCollection = async (file: string | Blob) => {
    const postmanLoader = new PostmanLoader(file);
    const jsonDoc = await postmanLoader.load();

    return jsonDoc;
}

const loadDirectoryDocs = async (directory: string) => {
    const directoryLoader = new DirectoryLoader(directory, {
        ".html": (path) => new TextLoader(path),
        ".json": (path) => new JSONLoader(path),
    });

    const docs = await directoryLoader.load();

    return docs;
}

const addDocuments = async (docs: Document<Record<string, any>>[], vectorStore: { addDocuments: (arg0: Document<Record<string, any>>[]) => any; }) => {
    const time = Date.now();

    let totalDocumentsAdded = 0;
    let chunk: Document<Record<string, any>>[] = [];

    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        chunk = docs.slice(i, i + CHUNK_SIZE);
        chunk = chunk.filter((doc) => doc.pageContent.trim() !== "");
        await vectorStore.addDocuments(chunk);
        totalDocumentsAdded += chunk.length;

        console.log("Documents Added: " + totalDocumentsAdded + " in " + (Date.now() - time) + "ms");
    }

    console.log("Embeddings Loaded in " + (Date.now() - time) + "ms");

    return totalDocumentsAdded;

}

export { loadJSONDoc, loadHTMLDoc, loadPostmanCollection, loadDirectoryDocs, addDocuments };

