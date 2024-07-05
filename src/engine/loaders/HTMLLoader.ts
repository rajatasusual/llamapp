import { TextLoader } from "langchain/document_loaders/fs/text";
import sanitizeHtml from 'sanitize-html';
import * as htmlparser2 from "htmlparser2";

/**
 * Class that extends the `TextLoader` class. It represents a document
 * loader that loads documents from HTML files. It has a constructor that
 * takes a `filePathOrBlob` parameter representing the path to the HTML
 * file or a `Blob` object.
 */
export class HTMLLoader extends TextLoader {
    constructor(filePathOrBlob: string | Blob) {
        super(filePathOrBlob);
    }
    /**
     * Method that takes a `raw` string as a parameter and returns a promise
     * that resolves to an array of strings. 
     * @param raw The raw HTML string to parse.
     * @returns A promise that resolves to an array of strings.
     */
    protected async parse(raw: string): Promise<string[]> {
        const textNodes = this.extractTextFromHtml(raw);
        return textNodes;
    }

    private extractTextFromHtml(html: string) {
        let textBuffer: any[] = [];
        let currentText = '';
        let linkBuffer: any = {};

        const parser = new htmlparser2.Parser({
            onopentag(name, attribs) {
                if (name === 'a' && attribs.href) {
                    // Start of anchor tag
                    linkBuffer = {
                        text: '',
                        href: attribs.href
                    };
                }
            },
            ontext(text) {
                if (linkBuffer) {
                    // Append text to the link buffer
                    linkBuffer.text += text;
                } else {
                    // Append text to the current text buffer
                    currentText += text;
                }
            },
            onclosetag(name) {
                if (name === 'a' && linkBuffer) {
                    // Close the anchor tag and format the link
                    currentText += `${linkBuffer.text} (${linkBuffer.href})`;
                    linkBuffer = null;
                } else if (name === 'p' || name === 'div') {
                    // Close the paragraph or div tag and push the accumulated text
                    textBuffer.push(currentText.trim());
                    currentText = '';
                }
            }
        }, { decodeEntities: true });

        // Sanitize the HTML to remove unwanted tags and attributes
        const sanitizedHtml = sanitizeHtml(html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['a']),
            allowedAttributes: {
                a: ['href']
            }
        });

        parser.write(sanitizedHtml);
        parser.end();

        // Add any remaining text in currentText to the buffer
        if (currentText.trim().length > 0) {
            textBuffer.push(currentText.trim());
        }

        return Array.from(new Set(textBuffer.map(node => node.trim().replace(/(\r\n|\n|\r)/gm, "")).filter(Boolean).filter(text => text.trim().length > 0)));
    }


}