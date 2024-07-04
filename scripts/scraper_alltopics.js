const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const startUrl = `https://www.qualtrics.com/support/survey-platform/getting-started/qualtrics-topics-a-z/`;
const outputDir = './pages';

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Fetch and parse a URL
async function fetchPage(url) {
    const response = await fetch(url);
    const body = await response.text();
    return cheerio.load(body);
}

// Save the content of a page to a file
function savePage(title, content) {
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, content);
}

// Recursively fetch and save content
async function crawl(url) {
    console.log(`Crawling: ${url}`);
    const $ = await fetchPage(url);
    const title = $('title').text().trim();
    const content = $.html();
    savePage(title, content);

    const links = $('#main > div > div > article > section > section > p > strong > u > a');
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const href = $(link).attr('href');
        if (href) {
            await crawl(href);
        }
    }
}

// Start the crawl
crawl(startUrl).then(() => {
    console.log('Crawl completed!');
}).catch((err) => {
    console.error('Crawl failed:', err);
});