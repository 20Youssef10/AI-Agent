class HistoryManager {
    constructor() {
        this.history = [];
    }

    addEntry(entry) {
        this.history.push({ entry, timestamp: new Date().toISOString() });
    }

    getHistory() {
        return this.history;
    }

    clearHistory() {
        this.history = [];
    }
}

module.exports = HistoryManager;