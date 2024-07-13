import axios from 'axios';
import * as unzipper from 'unzipper';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';

// Promisify necessary fs functions
const createReadStream = fs.createReadStream;

// Function to download and extract the repository
async function downloadAndExtractRepo(owner = 'rajatasusual', repo = 'llamapp', branch = 'main'): Promise<string> {

    // Define the URL for the repository ZIP file
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

    console.log(`Downloading repository from ${url}`);
    try {
        // Create a temporary directory
        const tmpDir = tmp.dirSync();
        console.log(`Temporary directory created at ${tmpDir.name}`);

        // Download the ZIP file
        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        // Create a path for the ZIP file
        const zipPath = path.join(tmpDir.name, `${repo}.zip`);

        // Write the downloaded ZIP file to the temporary directory
        fs.writeFileSync(zipPath, response.data);

        // Extract the ZIP file
        const extractPath = path.join(tmpDir.name, repo);
        await new Promise((resolve, reject) => {
            createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: extractPath }))
                .on('close', resolve)
                .on('error', reject);
        });

        console.log(`Repository extracted to ${extractPath}`);
        return extractPath;

    } catch (error) {
        console.error(`Failed to download and extract repository: ${error}`);
        throw error;
    }
}


export { downloadAndExtractRepo };