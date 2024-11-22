// Save options to chrome.storage
const saveOptions = () => {
    const apiKey = document.getElementById('apiKey').value;
    
    chrome.storage.sync.set(
        { groqApiKey: apiKey },
        () => {
            // Update status to let user know options were saved
            const status = document.getElementById('status');
            status.textContent = 'Settings saved successfully!';
            status.className = 'status success';
            status.style.display = 'block';

            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    );
};

// Restore options from chrome.storage
const restoreOptions = () => {
    chrome.storage.sync.get(
        { groqApiKey: '' },
        (items) => {
            document.getElementById('apiKey').value = items.groqApiKey;
        }
    );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
