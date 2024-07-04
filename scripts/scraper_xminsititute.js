const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrape(url) {
  try {
    // Fetch the webpage content
    const { data } = await axios.get(url);

    // Load the HTML into cheerio
    const $ = cheerio.load(data);

    // Initialize an empty array to hold the results
    let results = [];

    // Find all h2 elements
    $('h2').each((index, element) => {
      // Get the text of the h2 element
      let question = $(element).text().trim();

      // Initialize an array to hold paragraphs
      let answers = [];

      // Get the next sibling elements until we reach another h2 or the end
      let nextElem = $(element).next();
      while (nextElem.length && nextElem[0].tagName !== 'h2') {
        if (nextElem[0].tagName === 'p') {
          // Add the paragraph text to the answers array
          answers.push(nextElem.text().trim());
        }
        // Move to the next sibling
        nextElem = nextElem.next();
      }

      // Add the question and its answers to the results array
      results.push(question.concat(':').concat(answers.join('\n')));
    });

    // Write the results to a JSON file
    fs.writeFileSync('docs/expert_answers.json', JSON.stringify(results, null, 2));
    console.log('Results saved to results.json');

  } catch (error) {
    console.error('Error fetching the webpage:', error);
  }
}

// Replace with the URL you want to scrape
const url = 'https://www.xminstitute.com/expert-answers';
scrape(url);