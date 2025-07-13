// Function to update popup stats
function updatePopupStats(stats) {
    document.getElementById('popup-total-rounds').textContent = stats.totalRounds;
    document.getElementById('popup-total-wins').textContent = stats.wins;
    document.getElementById('popup-total-losses').textContent = stats.losses;
    const winRate = stats.totalRounds > 0 
        ? ((stats.wins / stats.totalRounds) * 100).toFixed(1) 
        : 0;
    document.getElementById('popup-win-rate').textContent = `${winRate}%`;
}

// Function to get stats from active tab
async function getStatsFromActiveTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.url.includes('stake.com')) {
            // Send message to content script to get current stats
            chrome.tabs.sendMessage(tab.id, { action: 'getStats' }, (response) => {
                if (response && response.stats) {
                    updatePopupStats(response.stats);
                }
            });
        }
    } catch (error) {
        console.error('Error getting stats:', error);
    }
}

// Update stats when popup is opened
document.addEventListener('DOMContentLoaded', getStatsFromActiveTab);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'statsUpdated' && message.stats) {
        updatePopupStats(message.stats);
    }
}); 