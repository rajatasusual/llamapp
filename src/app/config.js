// Default configuration values
const defaultConfig = {
    REWRITE: true,
    FUSION: true,
    CHAT_TEMPERATURE: 0,
    L2_INDEX_THRESHOLD: 250,
    COSINE_INDEX_THRESHOLD: 0.25,
    FUSION_THRESHOLD: 0.1
};

// Function to set default values in localStorage if they don't already exist
function setDefaultConfig() {
    for (const [key, value] of Object.entries(defaultConfig)) {
        if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, JSON.stringify(value));
        }
    }
}

// Call the function to set default values
setDefaultConfig();

// Function to get a configuration value from localStorage
function getConfigValue(key) {
    const value = localStorage.getItem(key);
    return value !== null ? JSON.parse(value) : null;
}

// Function to open the settings panel
function openSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.add('open');

    // Load current config values into the form
    document.getElementById('REWRITE').checked = getConfigValue('REWRITE');
    document.getElementById('FUSION').checked = getConfigValue('FUSION');
    document.getElementById('CHAT_TEMPERATURE').value = getConfigValue('CHAT_TEMPERATURE');
    document.getElementById('L2_INDEX_THRESHOLD').value = getConfigValue('L2_INDEX_THRESHOLD');
    document.getElementById('COSINE_INDEX_THRESHOLD').value = getConfigValue('COSINE_INDEX_THRESHOLD');
    document.getElementById('FUSION_THRESHOLD').value = getConfigValue('FUSION_THRESHOLD');
}

// Function to close the settings panel
function closeSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.remove('open');
}

// Function to save settings
function saveSettings() {
    const rewrite = document.getElementById('REWRITE').checked;
    const fusion = document.getElementById('FUSION').checked;
    const chatTemperature = parseFloat(document.getElementById('CHAT_TEMPERATURE').value);
    const l2IndexThreshold = parseInt(document.getElementById('L2_INDEX_THRESHOLD').value, 10);
    const cosineIndexThreshold = parseFloat(document.getElementById('COSINE_INDEX_THRESHOLD').value);
    const fusionThreshold = parseFloat(document.getElementById('FUSION_THRESHOLD').value);

    localStorage.setItem('REWRITE', JSON.stringify(rewrite));
    localStorage.setItem('FUSION', JSON.stringify(fusion));
    localStorage.setItem('CHAT_TEMPERATURE', JSON.stringify(chatTemperature));
    localStorage.setItem('L2_INDEX_THRESHOLD', JSON.stringify(l2IndexThreshold));
    localStorage.setItem('COSINE_INDEX_THRESHOLD', JSON.stringify(cosineIndexThreshold));
    localStorage.setItem('FUSION_THRESHOLD', JSON.stringify(fusionThreshold));

    closeSettings();
}