import { TextLoader } from "langchain/document_loaders/fs/text";
import { Document } from "langchain/document";

/**
 * Class that extends the `TextLoader` class. It represents a document
 * loader that loads documents from HTML files. It has a constructor that
 * takes a `filePathOrBlob` parameter representing the path to the HTML
 * file or a `Blob` object.
 */
export class PostmanLoader extends TextLoader {
    constructor(filePathOrBlob: string | Blob) {
        super(filePathOrBlob);
    }
    /**
     * Method that takes a `raw` string as a parameter and returns a promise
     * that resolves to an array of strings. 
     * @param raw The raw JSON string to parse.
     * @returns A promise that resolves to an array of strings.
     */
    protected async parse(raw: string): Promise<any[]> {
        const textNodes = this.extractAPIsFromCollection(JSON.parse(raw));
        return textNodes;
    }

    async load(): Promise<Document<Record<string, any>>[]> {
        let text;
        let metadata;
        if (typeof this.filePathOrBlob === "string") {
            const { readFile } = await TextLoader.imports();
            text = await readFile(this.filePathOrBlob, "utf8");
            metadata = { source: this.filePathOrBlob };
        }
        else {
            text = await this.filePathOrBlob.text();
            metadata = { source: "blob", blobType: this.filePathOrBlob.type };
        }
        const parsed = await this.parse(text);

        const docs = parsed.map((item) => {
            const doc = (new Document({ pageContent: JSON.stringify(item)}));
            doc.metadata = { ...doc.metadata, ...item.metadata };
            return doc;
        });

        return docs;
    }

    /**
     * Recursive function to traverse the collection
     *
     * @param {any[]} itemsArray - array of items to traverse
     * @return {void} 
     */
    private extractAPIsFromCollection(collection: { item: any; }) {
        const items: any[] = [];

        // Recursive function to traverse the collection
        const traverseItems = (itemsArray: any[]) => {
            itemsArray.forEach((item) => {
                if (item.request) {
                    items.push({pageContent: JSON.stringify(item), metadata: {name: item.name, url: item.request.url.raw}}); // Push entire item as a JSON string
                }
                if (item.item) {
                    traverseItems(item.item);
                }
            });
        };

        if (collection.item && Array.isArray(collection.item)) {
            traverseItems(collection.item);
        }

        return items;
    }


}