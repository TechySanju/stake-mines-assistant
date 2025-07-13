// Game state management
let gameState = {
    rounds: 0,
    wins: 0,
    losses: 0,
    lastResult: "",
    tilesRevealed: 0,
    currentMineCount: 0,
    currentBetAmount: 0,
    totalWon: 0,
    totalLost: 0,
    walletAmount: 0,
    currencyType: "inr", // Default currency
    
    // Recovery system state
    recovery: {
        cumulativeLoss: 0,
        lastGemGoal: 0,
        recoveryBetAmount: 0,
        recoveryGemGoal: 2, // Default to 2 gems for recovery
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
        isRecoveryMode: false
    },
    
    // Pattern tracking state
    patterns: {
        tiles: Array(25).fill().map(() => ({
            clicks: 0,
            safe: 0,
            bombs: 0,
            lastResult: null,
            lastUpdate: null,
            lastGames: [] // Track last few games this tile was revealed
        })),
        currentRound: {
            mineCount: 0,
            revealedTiles: [],
            startTime: null
        },
        settings: {
            heatmapEnabled: true,
            heatmapMode: 'pattern', // 'pattern' or 'probability'
            heatmapOpacity: 0.4,
            showTooltips: true,
            colorBlindMode: false,
            showControls: false // Track if controls are visible
        },
        lastGames: [], // Track last few games for suggestions
        analysis: {
            globalStats: {
                totalGames: 0,
                totalWins: 0,
                totalLosses: 0,
                averageMineCount: 0,
                lastUpdated: null
            },
            tileStats: Array(25).fill().map(() => ({
                totalGames: 0,
                mineCount: 0,
                safeCount: 0,
                winRate: 0,
                lastMineTime: null,
                consecutiveSafe: 0,
                consecutiveMines: 0,
                hotStreak: 0,
                coldStreak: 0,
                patternHistory: [], // Last 10 results
                timeBasedStats: {
                    morning: { games: 0, mines: 0 },
                    afternoon: { games: 0, mines: 0 },
                    evening: { games: 0, mines: 0 },
                    night: { games: 0, mines: 0 }
                }
            })),
            userPatterns: {
                preferredTiles: [], // Most clicked tiles
                avoidedTiles: [], // Least clicked tiles
                winStreakTiles: [], // Tiles that led to wins
                lossStreakTiles: [], // Tiles that led to losses
                timeBasedPreferences: {}, // Time-based tile preferences
                lastGameResults: [] // Last 10 game results
            },
            suggestions: {
                currentSuggestions: [],
                confidence: 0,
                lastUpdate: null,
                reasoning: ''
            }
        }
    }
};

// Debug logging
const DEBUG = true;
function debugLog(...args) {
    if (DEBUG) {
        console.log('[Mines Assistant]', ...args);
    }
}

// Helper function to calculate gem chance
function calculateGemChance(mineCount, tilesRevealed, totalTiles = 25) {
    if (tilesRevealed >= totalTiles) return 0;
    const gemsLeft = totalTiles - mineCount - tilesRevealed;
    const tilesLeft = totalTiles - tilesRevealed;
    return (gemsLeft / tilesLeft) * 100;
}

// Helper function to get currency symbol
function getCurrencySymbol(currencyType) {
    const symbols = {
        // Fiat
        'inr': '₹',
        
        // Major Cryptocurrencies
        'btc': '₿',
        'eth': 'Ξ',
        'ltc': 'Ł',
        'usdt': '₮',
        'sol': '◎',
        'doge': 'Ð',
        'bch': 'BCH',
        'xrp': 'XRP',
        'trx': 'TRX',
        'eos': 'EOS',
        'bnb': 'BNB',
        'usdc': 'USDC',
        'ape': 'APE',
        'busd': 'BUSD',
        'cro': 'CRO',
        'dai': 'DAI',
        'link': 'LINK',
        'sand': 'SAND',
        'shib': 'SHIB',
        'uni': 'UNI',
        'pol': 'POL',
        'trump': 'TRUMP'
    };
    
    // Convert to lowercase for case-insensitive matching
    const type = currencyType.toLowerCase();
    
    // Return the symbol if found, otherwise return the currency code
    return symbols[type] || type.toUpperCase();
}

// Helper function to parse currency amount
function parseCurrencyAmount(amountStr) {
    if (!amountStr) return 0;
    // Remove currency symbol and any spaces, then parse as float
    return parseFloat(amountStr.replace(/[^0-9.-]+/g, '')) || 0;
}

// Helper function to format currency
function formatCurrency(amount) {
    const symbol = getCurrencySymbol(gameState.currencyType);
    // For cryptocurrencies, we might want to show more decimal places
    const decimals = ['btc', 'eth', 'usdt', 'usdc', 'busd', 'dai'].includes(gameState.currencyType.toLowerCase()) ? 2 : 2;
    return `${symbol}${amount.toFixed(decimals)}`;
}

// Helper function to detect currency type
function detectCurrencyType() {
    const currencyEl = document.querySelector('.currency .variant-subtle[title]');
    if (currencyEl) {
        const currencyType = currencyEl.getAttribute('title');
        if (currencyType && currencyType !== gameState.currencyType) {
            gameState.currencyType = currencyType;
            debugLog('Currency type updated:', currencyType);
        }
    }
}

// Helper function to calculate recovery bet
function calculateRecoveryBet(cumulativeLoss, mineCount, gemGoal) {
    // Multiplier lookup table for different mine counts and gem goals
    const multiplierTable = {
        1: { 2: 1.99, 3: 2.94, 4: 3.88, 5: 4.81 },
        2: { 2: 1.98, 3: 2.92, 4: 3.85, 5: 4.77 },
        3: { 2: 1.97, 3: 2.90, 4: 3.82, 5: 4.73 },
        4: { 2: 1.96, 3: 2.88, 4: 3.79, 5: 4.69 },
        5: { 2: 1.95, 3: 2.86, 4: 3.76, 5: 4.65 }
    };

    // Get multiplier for current mine count and gem goal
    const multiplier = multiplierTable[mineCount]?.[gemGoal] || 1.99;
    const profitMultiplier = multiplier - 1;
    
    // Calculate recovery bet
    let recoveryBet = cumulativeLoss / profitMultiplier;
    
    // Cap at 10% of bankroll
    const maxBet = gameState.walletAmount * 0.1;
    if (recoveryBet > maxBet) {
        // If bet is too large, suggest splitting into multiple rounds
        return {
            betAmount: maxBet,
            needsMultipleRounds: true,
            roundsNeeded: Math.ceil(recoveryBet / maxBet),
            multiplier: multiplier,
            profitMultiplier: profitMultiplier
        };
    }
    
    return {
        betAmount: recoveryBet,
        needsMultipleRounds: false,
        roundsNeeded: 1,
        multiplier: multiplier,
        profitMultiplier: profitMultiplier
    };
}

// Create and inject floating UI
function createFloatingUI() {
    debugLog('Creating floating UI');
    
    // Remove existing UI if present
    const existingUI = document.getElementById('mines-stats-box');
    if (existingUI) {
        existingUI.remove();
    }

    const statsBox = document.createElement("div");
    statsBox.id = "mines-stats-box";
    statsBox.innerHTML = `
        <div id="mines-header">🎮 Stake Mines Stats</div>
        <div id="mines-body">
            <div><strong>Multiplier:</strong> <span id="multiplier">0x</span></div>
            <div><strong>Potential Win:</strong> <span id="potential-win">₹0.00</span></div>
            <div><strong>Revealed Tiles:</strong> <span id="tiles">0</span></div>
            <div><strong>Status:</strong> <span id="status">Waiting...</span></div>
            <div><strong>Number of Bets:</strong> <span id="rounds">0</span></div>
            <div><strong>Win Bets:</strong> <span id="wins">0</span></div>
            <div><strong>Loss Bets:</strong> <span id="losses">0</span></div>
            <div><strong>Total Won:</strong> <span id="total-won">₹0.00</span></div>
            <div><strong>Total Lost:</strong> <span id="total-lost">₹0.00</span></div>
            <div><strong>Profit/Loss:</strong> <span id="profit-loss">₹0.00</span></div>
            <div><strong>Current Mines:</strong> <span id="mine-count">0</span></div>
            <div><strong>Gem Chance:</strong> <span id="gem-chance">0%</span></div>
            <div id="gem-chance-details">
                <div class="chance-row">
                    <span>Gems Left:</span>
                    <span id="gems-left">0</span>
                </div>
                <div class="chance-row">
                    <span>Tiles Left:</span>
                    <span id="tiles-left">0</span>
                </div>
            </div>
            <div id="recovery-section" class="recovery-section">
                <div class="recovery-header">🔄 Recovery System</div>
                <div id="recovery-status" class="recovery-status">Inactive</div>
                <div id="recovery-details" class="recovery-details">
                    <div class="recovery-row">
                        <span>Cumulative Loss:</span>
                        <span id="cumulative-loss">₹0.00</span>
                    </div>
                    <div class="recovery-row">
                        <span>Recovery Bet:</span>
                        <span id="recovery-bet">₹0.00</span>
                    </div>
                    <div class="recovery-row">
                        <span>Target Gems:</span>
                        <span id="recovery-gems">2</span>
                    </div>
                    <div class="recovery-row">
                        <span>Potential Win:</span>
                        <span id="recovery-win">₹0.00</span>
                    </div>
                    <div id="recovery-warning" class="recovery-warning"></div>
                </div>
            </div>
            <div class="control-section">
                <div class="control-header">
                    <span>Heatmap Controls</span>
                    <label class="switch">
                        <input type="checkbox" id="stats-heatmap-toggle" ${gameState.patterns.settings.heatmapEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div id="heatmap-suggestions" class="heatmap-suggestions">
                    <div class="suggestion-header">Suggested Tiles</div>
                    <div class="suggestion-content">Play a few games to get suggestions</div>
                </div>
            </div>
            <div id="ai-insights-section" class="ai-insights-section">
                <div class="ai-header">
                    <span class="ai-title">🤖 AI Insights</span>
                    <span class="ai-status">Analyzing...</span>
                </div>
                <div class="ai-content">
                    <div class="suggestions-panel">
                        <div class="panel-header">Top Suggestions</div>
                        <div id="ai-suggestions" class="suggestions-list">
                            <div class="loading-suggestions">Analyzing patterns...</div>
                        </div>
                    </div>
                    <div class="insights-panel">
                        <div class="panel-header">Pattern Insights</div>
                        <div id="ai-insights" class="insights-content">
                            <div class="loading-insights">Gathering insights...</div>
                        </div>
                    </div>
                    <div class="stats-panel">
                        <div class="panel-header">Time Analysis</div>
                        <div id="ai-time-stats" class="time-stats">
                            <div class="loading-stats">Calculating statistics...</div>
                        </div>
                    </div>
                </div>
            </div>
            <button id="reset-stats">🔄 Reset</button>
        </div>
    `;
    document.body.appendChild(statsBox);
    debugLog('Floating UI created');

    // Add styles
    const style = document.createElement("style");
    style.innerHTML = `
        #mines-stats-box {
            position: fixed;
            top: 100px;
            left: 100px;
            background: rgba(0,0,0,0.95);
            color: white;
            padding: 8px;
            border-radius: 12px;
            z-index: 999999;
            font-size: 13px;
            width: 240px;
            max-height: 80vh;
            user-select: none;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            font-family: 'Roboto Mono', monospace;
            display: flex;
            flex-direction: column;
        }

        #mines-header {
            font-weight: bold;
            margin-bottom: 4px;
            cursor: grab;
            font-size: 14px;
            color: #00ff9d;
            text-shadow: 0 0 10px rgba(0,255,157,0.5);
            padding: 4px 0;
            flex-shrink: 0;
        }

        #mines-body {
            overflow-y: auto;
            padding-right: 4px;
            flex-grow: 1;
            max-height: calc(80vh - 40px);
        }

        #mines-body::-webkit-scrollbar {
            width: 6px;
        }

        #mines-body::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.2);
            border-radius: 3px;
        }

        #mines-body::-webkit-scrollbar-thumb {
            background: rgba(0,255,157,0.3);
            border-radius: 3px;
        }

        #mines-body::-webkit-scrollbar-thumb:hover {
            background: rgba(0,255,157,0.5);
        }

        #mines-body > div {
            margin: 3px 0;
            font-size: 12px;
            line-height: 1.3;
        }

        #reset-stats {
            margin: 6px 0 0 0;
            background: #ff3b3b;
            color: white;
            border: none;
            padding: 4px;
            width: 100%;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Roboto Mono', monospace;
            font-size: 12px;
            flex-shrink: 0;
        }

        .recovery-section,
        .control-section,
        .ai-insights-section {
            margin: 6px 0;
            padding: 6px;
        }

        .recovery-header,
        .control-header,
        .ai-header {
            padding: 4px 8px;
            margin-bottom: 4px;
        }

        .recovery-details,
        .heatmap-suggestions,
        .ai-content {
            padding: 4px;
        }

        .recovery-row,
        .chance-row {
            margin: 2px 0;
            font-size: 11px;
        }

        .suggestions-panel,
        .insights-panel,
        .stats-panel {
            margin-bottom: 6px;
        }

        .panel-header {
            padding: 4px 6px;
        }

        .suggestions-list,
        .insights-content,
        .time-stats {
            padding: 4px;
        }

        .suggestion-item {
            padding: 4px 6px;
            margin-bottom: 3px;
        }

        .insight-item {
            margin-bottom: 3px;
            padding: 3px 4px;
        }

        .time-slot {
            margin-bottom: 3px;
            padding: 3px 4px;
        }

        #gem-chance-details {
            background: rgba(255,255,255,0.1);
            padding: 4px;
            border-radius: 4px;
            margin-top: 4px;
        }
        .chance-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin: 2px 0;
        }
        #profit-loss {
            font-weight: bold;
        }
        #profit-loss.positive {
            color: #00ff9d;
            text-shadow: 0 0 5px rgba(0,255,157,0.5);
        }
        #profit-loss.negative {
            color: #ff3b3b;
            text-shadow: 0 0 5px rgba(255,59,59,0.5);
        }
        .recovery-section {
            background: rgba(0,255,157,0.1);
            border: 1px solid rgba(0,255,157,0.3);
            border-radius: 6px;
            padding: 8px;
            margin-top: 8px;
        }
        .recovery-header {
            color: #00ff9d;
            font-weight: bold;
            margin-bottom: 4px;
            font-size: 13px;
        }
        .recovery-status {
            font-size: 12px;
            margin-bottom: 4px;
            padding: 2px 4px;
            border-radius: 3px;
            background: rgba(0,255,157,0.2);
            display: inline-block;
        }
        .recovery-status.active {
            background: rgba(0,255,157,0.3);
            color: #00ff9d;
        }
        .recovery-details {
            font-size: 12px;
        }
        .recovery-row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
        }
        .recovery-warning {
            margin-top: 4px;
            padding: 4px;
            border-radius: 3px;
            font-size: 11px;
            color: #ffd700;
            background: rgba(255,215,0,0.1);
            display: none;
        }
        .recovery-warning.show {
            display: block;
        }
        .control-section {
            background: rgba(0,255,157,0.1);
            border: 1px solid rgba(0,255,157,0.3);
            border-radius: 6px;
            padding: 8px;
            margin-top: 8px;
        }
        
        .control-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            color: #00ff9d;
            font-weight: bold;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 20px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #00ff9d;
        }
        
        input:checked + .slider:before {
            transform: translateX(20px);
        }
        
        .heatmap-suggestions {
            font-size: 12px;
            margin-top: 8px;
        }
        
        .suggestion-header {
            color: #00ff9d;
            margin-bottom: 4px;
        }
        
        .suggestion-content {
            background: rgba(0,0,0,0.2);
            padding: 4px;
            border-radius: 4px;
            min-height: 40px;
        }
        
        #mines-heatmap-controls {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.95);
            padding: 12px;
            border-radius: 12px;
            z-index: 1002;
            font-family: 'Roboto Mono', monospace;
            color: white;
            font-size: 12px;
            user-select: none;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            border: 1px solid rgba(0,255,157,0.3);
            display: none;
        }
        
        #mines-heatmap-controls.visible {
            display: block;
        }
        
        .heatmap-controls-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            cursor: move;
            color: #00ff9d;
        }
        
        .heatmap-controls-header:hover {
            color: #00ff9d;
            text-shadow: 0 0 5px rgba(0,255,157,0.5);
        }
        
        .heatmap-control {
            margin: 8px 0;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        
        .heatmap-control:hover {
            background: rgba(255,255,255,0.1);
        }
        
        .heatmap-control label {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
        }
        
        .heatmap-control select {
            background: rgba(255,255,255,0.1);
            color: white;
            border: 1px solid rgba(255,255,255,0.2);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .heatmap-control select:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.3);
        }
        
        .heatmap-control input[type="range"] {
            width: 100px;
            cursor: pointer;
        }
        
        .suggested-tile {
            display: inline-block;
            padding: 2px 6px;
            margin: 2px;
            background: rgba(0,255,157,0.2);
            border: 1px solid rgba(0,255,157,0.3);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .suggested-tile:hover {
            background: rgba(0,255,157,0.3);
            transform: scale(1.05);
        }

        .ai-insights-section {
            background: rgba(0,255,157,0.05);
            border: 1px solid rgba(0,255,157,0.2);
            border-radius: 8px;
            margin: 8px 0;
            overflow: hidden;
        }

        .ai-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(0,255,157,0.1);
            border-bottom: 1px solid rgba(0,255,157,0.2);
        }

        .ai-title {
            color: #00ff9d;
            font-weight: bold;
            font-size: 13px;
            text-shadow: 0 0 5px rgba(0,255,157,0.3);
        }

        .ai-status {
            font-size: 11px;
            color: rgba(255,255,255,0.7);
            padding: 2px 6px;
            background: rgba(0,0,0,0.3);
            border-radius: 4px;
            border: 1px solid rgba(0,255,157,0.2);
        }

        .ai-content {
            padding: 8px;
        }

        .suggestions-panel,
        .insights-panel,
        .stats-panel {
            background: rgba(0,0,0,0.2);
            border-radius: 6px;
            margin-bottom: 8px;
            overflow: hidden;
        }

        .panel-header {
            padding: 6px 8px;
            background: rgba(0,255,157,0.1);
            font-size: 12px;
            color: #00ff9d;
            border-bottom: 1px solid rgba(0,255,157,0.2);
        }

        .suggestions-list {
            padding: 8px;
        }

        .suggestion-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 8px;
            margin-bottom: 4px;
            background: rgba(0,255,157,0.05);
            border: 1px solid rgba(0,255,157,0.2);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .suggestion-item:hover {
            background: rgba(0,255,157,0.1);
            transform: translateX(2px);
        }

        .suggestion-tile {
            font-weight: bold;
            color: #00ff9d;
        }

        .suggestion-confidence {
            font-size: 11px;
            color: rgba(255,255,255,0.9);
            background: rgba(0,0,0,0.3);
            padding: 2px 6px;
            border-radius: 3px;
            border: 1px solid rgba(0,255,157,0.2);
        }

        .suggestion-reasons {
            font-size: 11px;
            color: rgba(255,255,255,0.7);
            margin-top: 4px;
        }

        .insights-content {
            padding: 8px;
            font-size: 11px;
            color: rgba(255,255,255,0.9);
        }

        .insight-item {
            margin-bottom: 6px;
            padding: 4px 6px;
            background: rgba(0,255,157,0.05);
            border-radius: 4px;
        }

        .insight-item:last-child {
            margin-bottom: 0;
        }

        .time-stats {
            padding: 8px;
            font-size: 11px;
        }

        .time-slot {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            padding: 4px 6px;
            background: rgba(0,255,157,0.05);
            border-radius: 4px;
        }

        .time-slot:last-child {
            margin-bottom: 0;
        }

        .time-label {
            color: rgba(255,255,255,0.9);
        }

        .time-value {
            color: #00ff9d;
        }

        .loading-suggestions,
        .loading-insights,
        .loading-stats {
            padding: 8px;
            color: rgba(255,255,255,0.5);
            font-style: italic;
            text-align: center;
        }

        @keyframes pulse {
            0% { opacity: 0.5; }
            50% { opacity: 1; }
            100% { opacity: 0.5; }
        }

        .ai-status.analyzing {
            animation: pulse 2s infinite;
        }
    `;
    document.head.appendChild(style);

    // Setup draggable functionality
    setupDraggable(statsBox);

    // Setup reset button
    document.getElementById("reset-stats").addEventListener("click", resetStats);

    // Setup heatmap toggle in stats UI with improved handling
    const statsHeatmapToggle = document.getElementById('stats-heatmap-toggle');
    if (statsHeatmapToggle) {
        statsHeatmapToggle.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            gameState.patterns.settings.heatmapEnabled = isEnabled;
            gameState.patterns.settings.showControls = isEnabled;
            
            const controls = document.getElementById('mines-heatmap-controls');
            if (controls) {
                if (isEnabled) {
                    controls.classList.add('visible');
                    // Position controls if they're not already positioned
                    if (!controls.style.left || !controls.style.top) {
                        controls.style.left = '20px';
                        controls.style.top = '20px';
                    }
                } else {
                    controls.classList.remove('visible');
                }
            }
            
            updateHeatmap();
            savePatterns();
            debugLog('Heatmap toggled from stats UI:', isEnabled);
        });
    }
}

// Make the UI draggable using pointer events
function setupDraggable(element) {
    let isDragging = false, startX, startY, offsetLeft, offsetTop;
    const header = element.querySelector("#mines-header");

    header.addEventListener("pointerdown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        offsetLeft = element.offsetLeft;
        offsetTop = element.offsetTop;
        header.setPointerCapture(e.pointerId);
    });

    header.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        element.style.left = `${offsetLeft + dx}px`;
        element.style.top = `${offsetTop + dy}px`;
    });

    header.addEventListener("pointerup", (e) => {
        isDragging = false;
        header.releasePointerCapture(e.pointerId);
    });
}

// Update the UI with current stats
function updateUI(multiplier, payout, tiles, status) {
    try {
        // Detect currency type
        detectCurrencyType();

        // Get current wallet amount (for calculations only)
        const walletEl = document.querySelector('.currency .weight-semibold span');
        if (walletEl) {
            gameState.walletAmount = parseCurrencyAmount(walletEl.textContent);
        }

        // Get current bet amount (for calculations only)
        const betInput = document.querySelector('[data-test="input-game-amount"]');
        if (betInput) {
            gameState.currentBetAmount = parseFloat(betInput.value) || 0;
        }

        // Calculate potential win
        const multiplierValue = parseFloat(multiplier) || 0;
        const potentialWin = gameState.currentBetAmount * multiplierValue;

        // Update UI elements
        document.getElementById("multiplier").textContent = multiplier;
        document.getElementById("potential-win").textContent = formatCurrency(potentialWin);
        document.getElementById("tiles").textContent = tiles;
        document.getElementById("status").textContent = status;
        document.getElementById("rounds").textContent = gameState.rounds;
        document.getElementById("wins").textContent = gameState.wins;
        document.getElementById("losses").textContent = gameState.losses;
        document.getElementById("total-won").textContent = formatCurrency(gameState.totalWon);
        document.getElementById("total-lost").textContent = formatCurrency(gameState.totalLost);
        
        // Calculate and display profit/loss
        const profitLoss = gameState.totalWon - gameState.totalLost;
        const profitLossEl = document.getElementById("profit-loss");
        profitLossEl.textContent = formatCurrency(profitLoss);
        profitLossEl.className = profitLoss >= 0 ? 'positive' : 'negative';

        document.getElementById("mine-count").textContent = gameState.currentMineCount;

        // Calculate and update gem chance
        const totalTiles = 25;
        const gemsLeft = totalTiles - gameState.currentMineCount - tiles;
        const tilesLeft = totalTiles - tiles;
        const gemChance = calculateGemChance(gameState.currentMineCount, tiles);

        document.getElementById("gem-chance").textContent = `${gemChance.toFixed(1)}%`;
        document.getElementById("gems-left").textContent = gemsLeft;
        document.getElementById("tiles-left").textContent = tilesLeft;

        // Update recovery section
        const recoveryStatus = document.getElementById("recovery-status");
        const recoveryDetails = document.getElementById("recovery-details");
        const recoveryWarning = document.getElementById("recovery-warning");
        
        if (gameState.recovery.isRecoveryMode) {
            recoveryStatus.textContent = "Active";
            recoveryStatus.classList.add("active");
            
            const recoveryCalc = calculateRecoveryBet(
                gameState.recovery.cumulativeLoss,
                gameState.currentMineCount,
                gameState.recovery.recoveryGemGoal
            );
            
            document.getElementById("cumulative-loss").textContent = 
                formatCurrency(gameState.recovery.cumulativeLoss);
            document.getElementById("recovery-bet").textContent = 
                formatCurrency(recoveryCalc.betAmount);
            document.getElementById("recovery-gems").textContent = 
                gameState.recovery.recoveryGemGoal;
            document.getElementById("recovery-win").textContent = 
                formatCurrency(recoveryCalc.betAmount * recoveryCalc.profitMultiplier);
            
            if (recoveryCalc.needsMultipleRounds) {
                recoveryWarning.textContent = 
                    `⚠️ Split into ${recoveryCalc.roundsNeeded} rounds of ${formatCurrency(recoveryCalc.betAmount)}`;
                recoveryWarning.classList.add("show");
            } else {
                recoveryWarning.classList.remove("show");
            }
        } else {
            recoveryStatus.textContent = "Inactive";
            recoveryStatus.classList.remove("active");
            document.getElementById("cumulative-loss").textContent = formatCurrency(0);
            document.getElementById("recovery-bet").textContent = formatCurrency(0);
            document.getElementById("recovery-gems").textContent = "2";
            document.getElementById("recovery-win").textContent = formatCurrency(0);
            recoveryWarning.classList.remove("show");
        }

        debugLog('UI Updated:', { 
            currencyType: gameState.currencyType,
            walletAmount: gameState.walletAmount,
            betAmount: gameState.currentBetAmount,
            multiplier,
            potentialWin,
            tiles,
            status,
            totalWon: gameState.totalWon,
            totalLost: gameState.totalLost,
            profitLoss
        });
    } catch (error) {
        debugLog('Error updating UI:', error);
    }
}

// Reset all stats
function resetStats() {
    debugLog('Resetting stats');
    const currentPatterns = gameState.patterns; // Preserve patterns
    gameState = {
        rounds: 0,
        wins: 0,
        losses: 0,
        lastResult: "",
        tilesRevealed: 0,
        currentMineCount: 0,
        currentBetAmount: 0,
        totalWon: 0,
        totalLost: 0,
        walletAmount: 0,
        currencyType: gameState.currencyType,
        recovery: {
            cumulativeLoss: 0,
            lastGemGoal: 0,
            recoveryBetAmount: 0,
            recoveryGemGoal: 2,
            recoveryAttempts: 0,
            maxRecoveryAttempts: 3,
            isRecoveryMode: false
        },
        patterns: {
            ...currentPatterns,
            tiles: currentPatterns.tiles.map(tile => ({
                ...tile,
                lastGames: [] // Reset last games but keep other stats
            })),
            lastGames: [], // Reset game history
            analysis: {
                globalStats: {
                    totalGames: 0,
                    totalWins: 0,
                    totalLosses: 0,
                    averageMineCount: 0,
                    lastUpdated: null
                },
                tileStats: currentPatterns.analysis.tileStats.map(tile => ({
                    ...tile,
                    totalGames: 0,
                    mineCount: 0,
                    safeCount: 0,
                    winRate: 0,
                    lastMineTime: null,
                    consecutiveSafe: 0,
                    consecutiveMines: 0,
                    hotStreak: 0,
                    coldStreak: 0,
                    patternHistory: [],
                    timeBasedStats: {
                        morning: { games: 0, mines: 0 },
                        afternoon: { games: 0, mines: 0 },
                        evening: { games: 0, mines: 0 },
                        night: { games: 0, mines: 0 }
                    }
                })),
                userPatterns: {
                    preferredTiles: [],
                    avoidedTiles: [],
                    winStreakTiles: [],
                    lossStreakTiles: [],
                    timeBasedPreferences: {},
                    lastGameResults: []
                },
                suggestions: {
                    currentSuggestions: [],
                    confidence: 0,
                    lastUpdate: null,
                    reasoning: ''
                }
            }
        }
    };
    updateUI("0x", "0.00", 0, "Reset");
    updateHeatmap();
    updateAIInsights();
}

// Helper function to get tile index from element
function getTileIndex(tileElement) {
    const tiles = Array.from(document.querySelectorAll('[data-test="mines-tile"]'));
    return tiles.indexOf(tileElement);
}

// Helper function to calculate tile success rate
function calculateTileSuccessRate(tile) {
    if (!tile) {
        debugLog('Warning: calculateTileSuccessRate called with null tile');
        return null;
    }
    
    if (tile.clicks === 0) {
        debugLog('Tile has no clicks yet');
        return null;
    }
    
    const successRate = (tile.safe / tile.clicks) * 100;
    debugLog('Calculated tile success rate:', {
        clicks: tile.clicks,
        safe: tile.safe,
        bombs: tile.bombs,
        successRate: successRate.toFixed(1) + '%'
    });
    return successRate;
}

// Helper function to get heatmap color
function getHeatmapColor(value, mode = 'pattern') {
    if (value === null) return 'rgba(128, 128, 128, 0.3)';
    
    if (gameState.patterns.settings.colorBlindMode) {
        // Color blind friendly palette
        if (mode === 'pattern') {
            if (value >= 80) return 'rgba(0, 114, 178, 0.4)';  // Blue
            if (value >= 60) return 'rgba(0, 158, 115, 0.4)';  // Green
            if (value >= 40) return 'rgba(240, 228, 66, 0.4)'; // Yellow
            if (value >= 20) return 'rgba(230, 159, 0, 0.4)';  // Orange
            return 'rgba(213, 94, 0, 0.4)';                    // Red
        } else {
            // Probability mode with color blind friendly colors
            if (value >= 80) return 'rgba(0, 114, 178, 0.4)';  // Blue
            if (value >= 60) return 'rgba(0, 158, 115, 0.4)';  // Green
            if (value >= 40) return 'rgba(240, 228, 66, 0.4)'; // Yellow
            if (value >= 20) return 'rgba(230, 159, 0, 0.4)';  // Orange
            return 'rgba(213, 94, 0, 0.4)';                    // Red
        }
    } else {
        // Regular color palette
        if (mode === 'pattern') {
            if (value >= 80) return 'rgba(0, 255, 157, 0.4)';  // Very safe
            if (value >= 60) return 'rgba(128, 255, 0, 0.4)';  // Safe
            if (value >= 40) return 'rgba(255, 255, 0, 0.4)';  // Neutral
            if (value >= 20) return 'rgba(255, 128, 0, 0.4)';  // Risky
            return 'rgba(255, 59, 59, 0.4)';                   // Dangerous
        } else {
            // Probability mode
            if (value >= 80) return 'rgba(0, 157, 255, 0.4)';  // Very likely safe
            if (value >= 60) return 'rgba(0, 128, 255, 0.4)';  // Likely safe
            if (value >= 40) return 'rgba(128, 128, 255, 0.4)'; // Neutral
            if (value >= 20) return 'rgba(255, 128, 128, 0.4)'; // Risky
            return 'rgba(255, 59, 59, 0.4)';                   // Dangerous
        }
    }
}

// Helper function to save patterns to localStorage
function savePatterns() {
    try {
        // Save both basic patterns and analysis
        const dataToSave = {
            basic: {
                tiles: gameState.patterns.tiles,
                settings: gameState.patterns.settings,
                lastGames: gameState.patterns.lastGames
            },
            analysis: gameState.patterns.analysis
        };
        localStorage.setItem('minesPatterns', JSON.stringify(dataToSave));
        debugLog('Patterns and analysis saved to localStorage');
    } catch (error) {
        debugLog('Error saving patterns:', error);
    }
}

// Helper function to load patterns from localStorage
function loadPatterns() {
    try {
        const saved = localStorage.getItem('minesPatterns');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Load basic patterns
            gameState.patterns = {
                ...gameState.patterns,
                ...parsed.basic,
                settings: gameState.patterns.settings // Keep current settings
            };
            // Load analysis if available
            if (parsed.analysis) {
                gameState.patterns.analysis = parsed.analysis;
            }
            debugLog('Patterns and analysis loaded from localStorage');
        }
    } catch (error) {
        debugLog('Error loading patterns:', error);
    }
}

// Create and inject heatmap overlay
function createHeatmapOverlay() {
    debugLog('Creating heatmap overlay');
    const gameGrid = document.querySelector('[data-test="game-mines"]');
    if (!gameGrid) {
        debugLog('Game grid not found, retrying in 1 second');
        setTimeout(createHeatmapOverlay, 1000);
        return;
    }

    // Remove existing overlay if present
    const existingOverlay = document.getElementById('mines-heatmap');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'mines-heatmap';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        grid-template-rows: repeat(5, 1fr);
        pointer-events: none;
        z-index: 1000;
    `;

    // Create cells for each tile
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.tileIndex = i;
        cell.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // Add text label container
        const label = document.createElement('div');
        label.className = 'heatmap-label';
        label.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Roboto Mono', monospace;
            font-size: 12px;
            font-weight: bold;
            color: white;
            text-shadow: 0 0 3px rgba(0,0,0,0.8);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        cell.appendChild(label);
        overlay.appendChild(cell);
    }

    // Add new styles for the labels
    const style = document.createElement('style');
    style.textContent += `
        .heatmap-cell {
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .heatmap-cell:hover .heatmap-label {
            opacity: 1 !important;
        }
        
        .heatmap-label {
            pointer-events: none;
            mix-blend-mode: difference;
        }
        
        #mines-heatmap-controls .heatmap-control {
            margin: 8px 0;
        }
        
        #mines-heatmap-controls .heatmap-control label {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        #mines-heatmap-controls .heatmap-control input[type="checkbox"] {
            margin: 0;
        }
    `;
    document.head.appendChild(style);

    // Ensure game grid has relative positioning
    if (getComputedStyle(gameGrid).position === 'static') {
        gameGrid.style.position = 'relative';
    }
    gameGrid.appendChild(overlay);

    // Create controls
    const controls = document.createElement('div');
    controls.id = 'mines-heatmap-controls';
    controls.innerHTML = `
        <div class="heatmap-controls-header" id="heatmap-controls-header">
            <span class="header-text">🎯 Heatmap Controls</span>
            <span class="controls-close">×</span>
        </div>
        <div class="heatmap-controls-content">
            <div class="heatmap-control">
                <label>Mode:</label>
                <div class="select-wrapper">
                    <select id="heatmap-mode">
                        <option value="pattern" ${gameState.patterns.settings.heatmapMode === 'pattern' ? 'selected' : ''}>Pattern History</option>
                        <option value="probability" ${gameState.patterns.settings.heatmapMode === 'probability' ? 'selected' : ''}>Probability</option>
                    </select>
                </div>
            </div>
            <div class="heatmap-control opacity-control">
                <label>Opacity:</label>
                <div class="range-wrapper">
                    <input type="range" id="heatmap-opacity" min="0" max="100" value="${Math.round(gameState.patterns.settings.heatmapOpacity * 100)}">
                    <div class="opacity-value">${Math.round(gameState.patterns.settings.heatmapOpacity * 100)}%</div>
                </div>
            </div>
            <div class="heatmap-control">
                <label>
                    <input type="checkbox" id="heatmap-tooltips" ${gameState.patterns.settings.showTooltips ? 'checked' : ''}>
                    Show Tooltips
                </label>
            </div>
            <div class="heatmap-control">
                <label>
                    <input type="checkbox" id="heatmap-colorblind" ${gameState.patterns.settings.colorBlindMode ? 'checked' : ''}>
                    Color Blind Mode
                </label>
            </div>
        </div>
    `;
    document.body.appendChild(controls);

    // Setup opacity control with proper event handling
    const opacityRange = document.getElementById('heatmap-opacity');
    const opacityValue = controls.querySelector('.opacity-value');
    
    if (opacityRange && opacityValue) {
        const updateOpacity = (value) => {
            const opacity = value / 100;
            gameState.patterns.settings.heatmapOpacity = opacity;
            opacityValue.textContent = `${value}%`;
            updateHeatmap();
            savePatterns();
            debugLog('Heatmap opacity updated:', opacity);
        };

        // Update on input for smooth sliding
        opacityRange.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            opacityValue.textContent = `${value}%`;
        });

        // Update on change for final value
        opacityRange.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            updateOpacity(value);
        });

        // Initial update
        updateOpacity(parseInt(opacityRange.value));
    }

    // Setup control event listeners
    const modeSelect = document.getElementById('heatmap-mode');
    const tooltipsCheckbox = document.getElementById('heatmap-tooltips');
    const colorblindCheckbox = document.getElementById('heatmap-colorblind');

    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            gameState.patterns.settings.heatmapMode = e.target.value;
            updateHeatmap();
            savePatterns();
            debugLog('Heatmap mode changed:', e.target.value);
        });
    }

    if (tooltipsCheckbox) {
        tooltipsCheckbox.addEventListener('change', (e) => {
            gameState.patterns.settings.showTooltips = e.target.checked;
            updateHeatmap();
            savePatterns();
            debugLog('Tooltips toggled:', e.target.checked);
        });
    }

    if (colorblindCheckbox) {
        colorblindCheckbox.addEventListener('change', (e) => {
            gameState.patterns.settings.colorBlindMode = e.target.checked;
            updateHeatmap();
            savePatterns();
            debugLog('Color blind mode toggled:', e.target.checked);
        });
    }

    // Make controls draggable with improved handling
    const header = controls.querySelector('.heatmap-controls-header');
    const closeBtn = controls.querySelector('.controls-close');
    
    let isDragging = false;
    let startX, startY, offsetLeft, offsetTop;
    let dragTimeout;

    const startDrag = (e) => {
        if (e.target === closeBtn) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        offsetLeft = controls.offsetLeft;
        offsetTop = controls.offsetTop;
        header.setPointerCapture(e.pointerId);
        controls.style.cursor = 'grabbing';
        controls.style.transition = 'none';
        controls.classList.add('dragging');
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        
        if (dragTimeout) {
            cancelAnimationFrame(dragTimeout);
        }
        
        dragTimeout = requestAnimationFrame(() => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Keep controls within viewport with padding
            const padding = 20;
            const maxX = window.innerWidth - controls.offsetWidth - padding;
            const maxY = window.innerHeight - controls.offsetHeight - padding;
            
            const newX = Math.min(Math.max(padding, offsetLeft + dx), maxX);
            const newY = Math.min(Math.max(padding, offsetTop + dy), maxY);
            
            controls.style.left = `${newX}px`;
            controls.style.top = `${newY}px`;
        });
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        controls.style.cursor = 'default';
        controls.style.transition = 'all 0.2s';
        controls.classList.remove('dragging');
        
        if (dragTimeout) {
            cancelAnimationFrame(dragTimeout);
        }
    };

    header.addEventListener('pointerdown', startDrag);
    header.addEventListener('pointermove', doDrag);
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    // Add close button functionality
    closeBtn.addEventListener('click', () => {
        controls.classList.remove('visible');
        gameState.patterns.settings.showControls = false;
        savePatterns();
    });

    // Initial update
    updateHeatmap();
    debugLog('Heatmap overlay created and initialized');
    return overlay;
}

// Update heatmap colors and tooltips
function updateHeatmap() {
    debugLog('Starting heatmap update');
    const overlay = document.getElementById('mines-heatmap');
    if (!overlay) {
        debugLog('Heatmap overlay not found, recreating...');
        createHeatmapOverlay();
        return;
    }

    if (!gameState.patterns.settings.heatmapEnabled) {
        debugLog('Heatmap disabled, hiding overlay');
        overlay.style.display = 'none';
        return;
    }

    debugLog('Updating heatmap with mode:', gameState.patterns.settings.heatmapMode);
    overlay.style.display = 'grid';
    const cells = overlay.querySelectorAll('.heatmap-cell');
    
    cells.forEach((cell, index) => {
        const tile = gameState.patterns.tiles[index];
        const label = cell.querySelector('.heatmap-label');
        let value, color, labelText;

        if (gameState.patterns.settings.heatmapMode === 'pattern') {
            value = calculateTileSuccessRate(tile);
            debugLog(`Tile ${index + 1} pattern stats:`, {
                clicks: tile.clicks,
                safe: tile.safe,
                bombs: tile.bombs,
                successRate: value
            });
            color = getHeatmapColor(value, 'pattern');
            labelText = value !== null ? `${value.toFixed(0)}%` : '';
        } else {
            // Probability mode
            const totalTiles = 25;
            const revealedTiles = gameState.tilesRevealed;
            const remainingTiles = totalTiles - revealedTiles;
            const remainingMines = gameState.currentMineCount;
            value = remainingTiles > 0 ? 
                ((remainingTiles - remainingMines) / remainingTiles) * 100 : 0;
            debugLog(`Tile ${index + 1} probability:`, {
                revealedTiles,
                remainingTiles,
                remainingMines,
                probability: value
            });
            color = getHeatmapColor(value, 'probability');
            labelText = `${value.toFixed(0)}%`;
        }

        // Apply color with current opacity
        const opacity = gameState.patterns.settings.heatmapOpacity;
        const rgbaColor = color.replace(/[\d.]+\)$/, `${opacity})`);
        cell.style.backgroundColor = rgbaColor;
        
        // Update label
        if (label) {
            label.textContent = labelText;
            // Show label if tile has been clicked or if showTooltips is enabled
            label.style.opacity = (tile.clicks > 0 || gameState.patterns.settings.showTooltips) ? '1' : '0';
        }
        
        // Update tooltip
        if (gameState.patterns.settings.showTooltips) {
            const stats = gameState.patterns.settings.heatmapMode === 'pattern' ?
                `Tile ${index + 1}\nClicks: ${tile.clicks}\nSafe: ${tile.safe}\nBombs: ${tile.bombs}\nSuccess: ${value ? value.toFixed(1) + '%' : 'N/A'}` :
                `Tile ${index + 1}\nSafe Probability: ${value.toFixed(1)}%`;
            cell.title = stats;
            cell.style.cursor = 'help';
        } else {
            cell.title = '';
            cell.style.cursor = 'default';
        }
    });

    debugLog('Heatmap update complete', {
        mode: gameState.patterns.settings.heatmapMode,
        opacity: gameState.patterns.settings.heatmapOpacity,
        tooltips: gameState.patterns.settings.showTooltips,
        colorBlind: gameState.patterns.settings.colorBlindMode
    });
}

// Update suggestions based on tile history
function updateSuggestions() {
    const suggestionsEl = document.querySelector('.suggestion-content');
    if (!suggestionsEl) return;

    // Get tiles that haven't been clicked in the last 2-3 games
    const lastGames = gameState.patterns.lastGames;
    if (lastGames.length < 2) {
        suggestionsEl.textContent = 'Play a few games to get suggestions';
        return;
    }

    const allClickedTiles = new Set(lastGames.flat());
    const suggestedTiles = [];
    
    for (let i = 0; i < 25; i++) {
        if (!allClickedTiles.has(i)) {
            const tile = gameState.patterns.tiles[i];
            const successRate = calculateTileSuccessRate(tile);
            if (successRate === null || successRate >= 50) {
                suggestedTiles.push({
                    index: i,
                    successRate: successRate || 100
                });
            }
        }
    }

    // Sort by success rate and take top 5
    suggestedTiles.sort((a, b) => b.successRate - a.successRate);
    const topSuggestions = suggestedTiles.slice(0, 5);

    if (topSuggestions.length === 0) {
        suggestionsEl.textContent = 'No suggestions available';
        return;
    }

    suggestionsEl.innerHTML = topSuggestions.map(tile => `
        <div class="suggested-tile" data-tile="${tile.index + 1}">
            Tile ${tile.index + 1}
            ${tile.successRate !== null ? `<br>${tile.successRate.toFixed(1)}% safe` : ''}
        </div>
    `).join('');

    // Add click handlers to suggested tiles
    suggestionsEl.querySelectorAll('.suggested-tile').forEach(el => {
        el.addEventListener('click', () => {
            const tileIndex = parseInt(el.dataset.tile) - 1;
            const gameTile = document.querySelectorAll('[data-test="mines-tile"]')[tileIndex];
            if (gameTile && !gameTile.hasAttribute('data-revealed')) {
                gameTile.click();
            }
        });
    });
}

// Add new pattern analysis state to gameState
function updatePatternAnalysis(tileIndex, isMine, gameResult) {
    const tile = gameState.patterns.analysis.tileStats[tileIndex];
    const now = new Date();
    const hour = now.getHours();
    
    // Update basic stats
    tile.totalGames++;
    if (isMine) {
        tile.mineCount++;
        tile.lastMineTime = now;
        tile.consecutiveMines++;
        tile.consecutiveSafe = 0;
        tile.coldStreak++;
        tile.hotStreak = 0;
    } else {
        tile.safeCount++;
        tile.consecutiveSafe++;
        tile.consecutiveMines = 0;
        tile.hotStreak++;
        tile.coldStreak = 0;
    }
    
    // Update win rate
    tile.winRate = (tile.safeCount / tile.totalGames) * 100;
    
    // Update pattern history (keep last 10)
    tile.patternHistory.push(isMine ? 'mine' : 'safe');
    if (tile.patternHistory.length > 10) {
        tile.patternHistory.shift();
    }
    
    // Update time-based stats
    const timeSlot = hour < 6 ? 'night' : 
                    hour < 12 ? 'morning' : 
                    hour < 18 ? 'afternoon' : 'evening';
    tile.timeBasedStats[timeSlot].games++;
    if (isMine) {
        tile.timeBasedStats[timeSlot].mines++;
    }
    
    // Update user patterns
    if (gameResult === 'win') {
        if (!gameState.patterns.analysis.userPatterns.winStreakTiles.includes(tileIndex)) {
            gameState.patterns.analysis.userPatterns.winStreakTiles.push(tileIndex);
        }
        gameState.patterns.analysis.userPatterns.lossStreakTiles = 
            gameState.patterns.analysis.userPatterns.lossStreakTiles.filter(t => t !== tileIndex);
    } else if (gameResult === 'loss') {
        if (!gameState.patterns.analysis.userPatterns.lossStreakTiles.includes(tileIndex)) {
            gameState.patterns.analysis.userPatterns.lossStreakTiles.push(tileIndex);
        }
        gameState.patterns.analysis.userPatterns.winStreakTiles = 
            gameState.patterns.analysis.userPatterns.winStreakTiles.filter(t => t !== tileIndex);
    }
    
    // Update global stats
    gameState.patterns.analysis.globalStats.totalGames++;
    if (gameResult === 'win') {
        gameState.patterns.analysis.globalStats.totalWins++;
    } else if (gameResult === 'loss') {
        gameState.patterns.analysis.globalStats.totalLosses++;
    }
    gameState.patterns.analysis.globalStats.lastUpdated = now;
    
    // Save updated patterns
    savePatterns();
}

// Add function to calculate tile safety score
function calculateTileSafetyScore(tileIndex) {
    const tile = gameState.patterns.analysis.tileStats[tileIndex];
    const now = new Date();
    const hour = now.getHours();
    const timeSlot = hour < 6 ? 'night' : 
                    hour < 12 ? 'morning' : 
                    hour < 18 ? 'afternoon' : 'evening';
    
    // Base score from win rate
    let score = tile.winRate;
    
    // Adjust for recent patterns
    const recentPatterns = tile.patternHistory.slice(-3);
    const recentMines = recentPatterns.filter(p => p === 'mine').length;
    score -= (recentMines * 10); // Penalize recent mines
    
    // Adjust for streaks
    if (tile.consecutiveSafe > 2) {
        score += (tile.consecutiveSafe * 2); // Bonus for safe streaks
    }
    if (tile.consecutiveMines > 0) {
        score -= (tile.consecutiveMines * 5); // Penalty for mine streaks
    }
    
    // Time-based adjustment
    const timeStats = tile.timeBasedStats[timeSlot];
    if (timeStats.games > 0) {
        const timeMineRate = (timeStats.mines / timeStats.games) * 100;
        score -= (timeMineRate * 0.5); // Slight penalty for higher mine rate in current time slot
    }
    
    // User pattern adjustment
    if (gameState.patterns.analysis.userPatterns.winStreakTiles.includes(tileIndex)) {
        score += 5; // Bonus for tiles that led to wins
    }
    if (gameState.patterns.analysis.userPatterns.lossStreakTiles.includes(tileIndex)) {
        score -= 5; // Penalty for tiles that led to losses
    }
    
    // Normalize score to 0-100 range
    return Math.max(0, Math.min(100, score));
}

// Add function to generate suggestions
function generateTileSuggestions() {
    const suggestions = [];
    const now = new Date();
    
    // Calculate safety scores for all tiles
    const tileScores = Array(25).fill().map((_, index) => ({
        index,
        score: calculateTileSafetyScore(index)
    }));
    
    // Sort by safety score
    tileScores.sort((a, b) => b.score - a.score);
    
    // Take top 3 suggestions
    const topSuggestions = tileScores.slice(0, 3);
    
    // Generate reasoning
    const reasoning = [];
    topSuggestions.forEach(suggestion => {
        const tile = gameState.patterns.analysis.tileStats[suggestion.index];
        const reasons = [];
        
        if (tile.consecutiveSafe > 2) {
            reasons.push(`${tile.consecutiveSafe} consecutive safe reveals`);
        }
        if (tile.winRate > 80) {
            reasons.push(`${tile.winRate.toFixed(1)}% win rate`);
        }
        if (gameState.patterns.analysis.userPatterns.winStreakTiles.includes(suggestion.index)) {
            reasons.push('historically successful for you');
        }
        
        suggestions.push({
            tileIndex: suggestion.index,
            confidence: suggestion.score,
            reasons: reasons.join(', ')
        });
    });
    
    // Update suggestions in state
    gameState.patterns.analysis.suggestions = {
        currentSuggestions: suggestions,
        confidence: suggestions[0]?.confidence || 0,
        lastUpdate: now,
        reasoning: suggestions.map(s => 
            `Tile ${s.tileIndex + 1}: ${s.confidence.toFixed(1)}% safe (${s.reasons})`
        ).join('\n')
    };
    
    return suggestions;
}

// Add function to update AI Insights
function updateAIInsights() {
    const suggestionsEl = document.getElementById('ai-suggestions');
    const insightsEl = document.getElementById('ai-insights');
    const timeStatsEl = document.getElementById('ai-time-stats');
    const aiStatusEl = document.querySelector('.ai-status');
    
    if (!suggestionsEl || !insightsEl || !timeStatsEl || !aiStatusEl) return;

    // Update suggestions
    const suggestions = gameState.patterns.analysis.suggestions.currentSuggestions;
    if (suggestions.length > 0) {
        suggestionsEl.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion-item" data-tile="${suggestion.tileIndex + 1}">
                <div>
                    <div class="suggestion-tile">Tile ${suggestion.tileIndex + 1}</div>
                    <div class="suggestion-reasons">${suggestion.reasons}</div>
                </div>
                <div class="suggestion-confidence">${suggestion.confidence.toFixed(1)}%</div>
            </div>
        `).join('');

        // Add click handlers to suggestions
        suggestionsEl.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('click', () => {
                const tileIndex = parseInt(el.dataset.tile) - 1;
                const gameTile = document.querySelectorAll('[data-test="mines-tile"]')[tileIndex];
                if (gameTile && !gameTile.hasAttribute('data-revealed')) {
                    gameTile.click();
                }
            });
        });
    } else {
        suggestionsEl.innerHTML = '<div class="loading-suggestions">Play more games to get suggestions</div>';
    }

    // Update insights
    const insights = [];
    const globalStats = gameState.patterns.analysis.globalStats;
    
    // Add global stats insights
    if (globalStats.totalGames > 0) {
        const winRate = (globalStats.totalWins / globalStats.totalGames) * 100;
        insights.push(`Overall win rate: ${winRate.toFixed(1)}% (${globalStats.totalGames} games)`);
    }

    // Add pattern insights
    const hotTiles = gameState.patterns.analysis.tileStats
        .filter(tile => tile.hotStreak >= 3)
        .map((_, index) => index + 1);
    if (hotTiles.length > 0) {
        insights.push(`Hot streak tiles: ${hotTiles.join(', ')}`);
    }

    const coldTiles = gameState.patterns.analysis.tileStats
        .filter(tile => tile.coldStreak >= 2)
        .map((_, index) => index + 1);
    if (coldTiles.length > 0) {
        insights.push(`Cold streak tiles: ${coldTiles.join(', ')}`);
    }

    // Add user pattern insights
    const winStreakTiles = gameState.patterns.analysis.userPatterns.winStreakTiles
        .map(index => index + 1);
    if (winStreakTiles.length > 0) {
        insights.push(`Your successful tiles: ${winStreakTiles.join(', ')}`);
    }

    if (insights.length > 0) {
        insightsEl.innerHTML = insights.map(insight => 
            `<div class="insight-item">${insight}</div>`
        ).join('');
    } else {
        insightsEl.innerHTML = '<div class="loading-insights">Play more games to see insights</div>';
    }

    // Update time stats
    const now = new Date();
    const hour = now.getHours();
    const currentTimeSlot = hour < 6 ? 'night' : 
                           hour < 12 ? 'morning' : 
                           hour < 18 ? 'afternoon' : 'evening';
    
    const timeSlots = [
        { label: 'Morning (6-12)', key: 'morning' },
        { label: 'Afternoon (12-18)', key: 'afternoon' },
        { label: 'Evening (18-24)', key: 'evening' },
        { label: 'Night (0-6)', key: 'night' }
    ];

    timeStatsEl.innerHTML = timeSlots.map(slot => {
        const stats = gameState.patterns.analysis.tileStats.reduce((acc, tile) => {
            const slotStats = tile.timeBasedStats[slot.key];
            acc.games += slotStats.games;
            acc.mines += slotStats.mines;
            return acc;
        }, { games: 0, mines: 0 });

        const mineRate = stats.games > 0 ? 
            (stats.mines / stats.games * 100).toFixed(1) : 0;
        
        const isCurrent = slot.key === currentTimeSlot;
        return `
            <div class="time-slot ${isCurrent ? 'current' : ''}">
                <span class="time-label">${slot.label}</span>
                <span class="time-value">
                    ${stats.games} games (${mineRate}% mines)
                    ${isCurrent ? ' • Current' : ''}
                </span>
            </div>
        `;
    }).join('');

    // Update AI status
    if (globalStats.totalGames > 0) {
        aiStatusEl.textContent = 'Active';
        aiStatusEl.classList.remove('analyzing');
    } else {
        aiStatusEl.textContent = 'Analyzing...';
        aiStatusEl.classList.add('analyzing');
    }
}

// Update detectGameData to track game history
function detectGameData() {
    try {
        const multiplierEl = document.querySelector(".number-multiplier");
        const payoutEl = document.querySelector(".payout-result.win .content");
        const tilesCount = document.querySelectorAll(".game-content [data-revealed='true']").length;
        const betButton = document.querySelector('[data-test="bet-button"]');
        const isBettingEnabled = betButton && !betButton.disabled;
        const mineTile = document.querySelector(".mine");
        const mineCountSelect = document.querySelector('[data-test="mines-count"]');

        // Update current mine count from select element
        if (mineCountSelect) {
            const newMineCount = parseInt(mineCountSelect.value) || 0;
            if (newMineCount !== gameState.currentMineCount) {
                gameState.currentMineCount = newMineCount;
                debugLog('Mine count updated:', newMineCount);
            }
        }

        const multiplier = multiplierEl?.innerText?.trim() || "0x";
        const payout = payoutEl?.innerText?.trim() || "₹0.00";

        let status = "Waiting...";

        // Track round start when bet button becomes enabled
        if (isBettingEnabled && gameState.tilesRevealed === 0 && gameState.lastResult === "") {
            status = "New Round";
            debugLog('New round started');
        }

        // Track win/loss and update stats immediately
        if (payoutEl && !payoutEl.dataset.counted) {
            status = "Win";
            if (gameState.lastResult !== "Win") {
                gameState.lastResult = "Win";
                gameState.wins++;
                gameState.rounds++;
                
                // Reset recovery system on win
                if (gameState.recovery.isRecoveryMode) {
                    gameState.recovery.cumulativeLoss = 0;
                    gameState.recovery.isRecoveryMode = false;
                    gameState.recovery.recoveryAttempts = 0;
                    debugLog('Recovery successful, resetting system');
                }
                
                // Calculate win amount from multiplier
                const multiplierValue = parseFloat(multiplier) || 0;
                const winAmount = gameState.currentBetAmount * multiplierValue;
                gameState.totalWon += winAmount;
                payoutEl.dataset.counted = "true";
                debugLog('Win bet recorded:', { 
                    rounds: gameState.rounds, 
                    wins: gameState.wins,
                    winAmount,
                    totalWon: gameState.totalWon
                });
                
                // Update pattern analysis for revealed tiles
                gameState.patterns.currentRound.revealedTiles.forEach(tileIndex => {
                    updatePatternAnalysis(tileIndex, false, 'win');
                });
                
                // Generate new suggestions
                generateTileSuggestions();
            }
        } else if (gameState.lastResult !== "Win" && mineTile && !mineTile.dataset.counted) {
            status = "Loss";
            if (gameState.lastResult === "") {
                gameState.lastResult = "Loss";
                gameState.losses++;
                gameState.rounds++;
                
                // Update recovery system on loss
                gameState.recovery.cumulativeLoss += gameState.currentBetAmount;
                gameState.recovery.isRecoveryMode = true;
                gameState.recovery.recoveryAttempts++;
                
                // Add bet amount to total lost
                gameState.totalLost += gameState.currentBetAmount;
                mineTile.dataset.counted = "true";
                debugLog('Loss bet recorded:', { 
                    rounds: gameState.rounds, 
                    losses: gameState.losses,
                    lossAmount: gameState.currentBetAmount,
                    totalLost: gameState.totalLost,
                    cumulativeLoss: gameState.recovery.cumulativeLoss,
                    recoveryAttempts: gameState.recovery.recoveryAttempts
                });
                
                // Update pattern analysis for revealed tiles
                gameState.patterns.currentRound.revealedTiles.forEach(tileIndex => {
                    const isMine = mineTile.dataset.tileIndex === tileIndex.toString();
                    updatePatternAnalysis(tileIndex, isMine, 'loss');
                });
                
                // Generate new suggestions
                generateTileSuggestions();
            }
        } else if (tilesCount > 0 && gameState.lastResult === "") {
            status = "In Progress";
        } else if (gameState.lastResult === "Win") {
            status = "Win";
        }

        // Reset for next round when tiles go back to 0
        if (gameState.tilesRevealed > 0 && tilesCount === 0) {
            if (gameState.lastResult !== "") {
                gameState.lastResult = "";
                // Clear counted status from any existing elements
                const existingPopup = document.querySelector(".payout-result.win .content");
                if (existingPopup) {
                    delete existingPopup.dataset.counted;
                }
                const existingMine = document.querySelector(".mine");
                if (existingMine) {
                    delete existingMine.dataset.counted;
                }
                debugLog('Round reset for next game');
            }
        }

        gameState.tilesRevealed = tilesCount;

        // Track tile reveals for patterns
        const revealedTiles = document.querySelectorAll('[data-test="mines-tile"][data-revealed="true"]');
        let patternUpdated = false;
        
        debugLog('Checking revealed tiles:', {
            totalRevealed: revealedTiles.length,
            currentRoundTiles: gameState.patterns.currentRound.revealedTiles.length,
            mineCount: gameState.currentMineCount
        });

        revealedTiles.forEach(tile => {
            const index = getTileIndex(tile);
            if (index === -1) {
                debugLog('Warning: Could not get tile index for revealed tile');
                return;
            }

            if (!gameState.patterns.currentRound.revealedTiles.includes(index)) {
                const tileData = gameState.patterns.tiles[index];
                if (!tileData) {
                    debugLog('Warning: No tile data found for index:', index);
                    return;
                }

                debugLog('Updating tile pattern data:', {
                    tileIndex: index,
                    previousClicks: tileData.clicks,
                    previousSafe: tileData.safe,
                    previousBombs: tileData.bombs
                });

                tileData.clicks++;
                
                if (tile.classList.contains('mine')) {
                    tileData.bombs++;
                    tileData.lastResult = 'bomb';
                    debugLog('Tile revealed as mine:', {
                        tileIndex: index,
                        newBombs: tileData.bombs
                    });
                } else {
                    tileData.safe++;
                    tileData.lastResult = 'safe';
                    debugLog('Tile revealed as safe:', {
                        tileIndex: index,
                        newSafe: tileData.safe
                    });
                }
                
                tileData.lastUpdate = Date.now();
                gameState.patterns.currentRound.revealedTiles.push(index);
                patternUpdated = true;

                debugLog('Tile pattern data updated:', {
                    tileIndex: index,
                    newClicks: tileData.clicks,
                    newSafe: tileData.safe,
                    newBombs: tileData.bombs,
                    lastResult: tileData.lastResult
                });
            }
        });

        // Reset current round data when new round starts
        if (isBettingEnabled && gameState.tilesRevealed === 0) {
            debugLog('Resetting current round data:', {
                previousMineCount: gameState.patterns.currentRound.mineCount,
                previousRevealedTiles: gameState.patterns.currentRound.revealedTiles.length,
                newMineCount: gameState.currentMineCount
            });

            gameState.patterns.currentRound = {
                mineCount: gameState.currentMineCount,
                revealedTiles: [],
                startTime: Date.now()
            };
            patternUpdated = true;
        }

        // Track game history
        if (isBettingEnabled && gameState.tilesRevealed === 0) {
            // New game starting
            if (gameState.patterns.currentRound.revealedTiles.length > 0) {
                debugLog('Saving game history:', {
                    revealedTiles: gameState.patterns.currentRound.revealedTiles,
                    mineCount: gameState.patterns.currentRound.mineCount,
                    currentHistoryLength: gameState.patterns.lastGames.length
                });

                // Save last game's revealed tiles
                gameState.patterns.lastGames.unshift(gameState.patterns.currentRound.revealedTiles);
                // Keep only last 5 games
                if (gameState.patterns.lastGames.length > 5) {
                    gameState.patterns.lastGames.pop();
                }
                // Update suggestions
                updateSuggestions();
            }
            
            gameState.patterns.currentRound = {
                mineCount: gameState.currentMineCount,
                revealedTiles: [],
                startTime: Date.now()
            };
        }

        // Save and update heatmap if patterns changed
        if (patternUpdated) {
            debugLog('Patterns updated, saving and refreshing heatmap');
            savePatterns();
            updateHeatmap();
        }

        // Update AI Insights after pattern analysis
        if (patternUpdated) {
            debugLog('Updating AI insights after pattern changes');
            updateAIInsights();
        }

        updateUI(multiplier, payout, tilesCount, status);
    } catch (error) {
        debugLog('Error detecting game data:', error);
    }
}

// Initialize the extension
function initialize() {
    debugLog('Initializing extension');
    createFloatingUI();
    loadPatterns(); // Load saved patterns
    
    // Wait for game grid to be available
    const initHeatmap = () => {
        const gameGrid = document.querySelector('[data-test="game-mines"]');
        if (gameGrid) {
            createHeatmapOverlay();
            debugLog('Heatmap initialized');
        } else {
            debugLog('Game grid not found, retrying in 1 second');
            setTimeout(initHeatmap, 1000);
        }
    };
    
    initHeatmap();
    
    // Start polling every second
    setInterval(detectGameData, 1000);

    // Initial AI Insights update
    updateAIInsights();
}

// Start the extension when the page is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 