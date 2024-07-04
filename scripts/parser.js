const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const inputDir = './pages';
const outputDir = './json';

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Parse an HTML file
function parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(content);
    const data = [];

    const sections = $('.solution-tags').nextAll('section');

    sections.each((_, section) => {
        const $section = $(section);
        const sectionData = {};
        const h2 = $section.find('h2').first();
        
        // Stop parsing if the h2 element with id 'RelatedArticles' is found
        if (h2.attr('id') === 'RelatedArticles') {
            return false;
        }

        sectionData.title = h2.text().trim();
        sectionData.content = [];

        $section.children().each((_, element) => {
            const $element = $(element);
            if ($element.is('p')) {
                sectionData.content.push({ type: 'paragraph', text: $element.text().trim() });
            } else if ($element.is('ol')) {
                const listItems = [];
                $element.find('li').each((_, li) => {
                    listItems.push($(li).text().trim());
                });
                sectionData.content.push({ type: 'list', items: listItems });
            }
        });

        data.push(sectionData);
    });

    return data;
}

// Process all HTML files in the input directory
fs.readdirSync(inputDir).forEach(file => {
    const filePath = path.join(inputDir, file);
    if (path.extname(file) === '.html') {
        const jsonData = parseFile(filePath);
        const jsonFileName = `${path.basename(file, '.html')}.json`;
        const jsonFilePath = path.join(outputDir, jsonFileName);
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        console.log(`Processed: ${file}`);
    }
});

console.log('Parsing completed!');