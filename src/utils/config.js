/**
 * Config Manager - Handles configuration and API key management
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.ai-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE = path.join(process.cwd(), '.env');

const DEFAULT_CONFIG = {
  apiKey: null,
  defaultModel: 'llama-3.3-70b-versatile',
  agentMode: 'build',
  lastWorkingDir: process.cwd(),
  workspaceRoot: process.cwd(),
  preferences: {
    autoSave: true,
    confirmDestructive: true,
    theme: 'dark',
    safeMode: true,
    previewChanges: true,
    showDiff: true,
    streamResponses: false,
    allowShellExecution: false,
    allowOutsideWorkspace: false,
    showIgnoredFiles: false,
    maxUndoHistory: 50,
    maxRetries: 2,
    retryBaseDelayMs: 500
  }
};

export class ConfigManager {
  constructor() {
    this.config = structuredClone(DEFAULT_CONFIG);
  }

  async init() {
    await fs.ensureDir(CONFIG_DIR);

    if (await fs.pathExists(CONFIG_FILE)) {
      try {
        const savedConfig = await fs.readJson(CONFIG_FILE);
        this.config = {
          ...DEFAULT_CONFIG,
          ...savedConfig,
          preferences: {
            ...DEFAULT_CONFIG.preferences,
            ...(savedConfig.preferences || {})
          }
        };
      } catch {
        console.warn(chalk.yellow('Warning: Could not load config file'));
      }
    }

    if (process.env.GROQ_API_KEY) {
      this.config.apiKey = process.env.GROQ_API_KEY;
    }

    if (await fs.pathExists(ENV_FILE)) {
      const envContent = await fs.readFile(ENV_FILE, 'utf8');
      const envMatch = envContent.match(/GROQ_API_KEY=(.+)/);
      if (envMatch && !this.config.apiKey) {
        this.config.apiKey = envMatch[1].trim();
      }
    }

    return this.config;
  }

  async save() {
    try {
      await fs.ensureDir(CONFIG_DIR);
      const configToSave = { ...this.config };
      if (process.env.GROQ_API_KEY && configToSave.apiKey === process.env.GROQ_API_KEY) {
        delete configToSave.apiKey;
      }
      await fs.writeJson(CONFIG_FILE, configToSave, { spaces: 2 });
      return true;
    } catch (error) {
      console.error(chalk.red('Error saving config:'), error.message);
      return false;
    }
  }

  async setApiKey(apiKey, saveToEnv = false) {
    this.config.apiKey = apiKey;

    if (saveToEnv) {
      try {
        let envContent = '';
        if (await fs.pathExists(ENV_FILE)) {
          envContent = await fs.readFile(ENV_FILE, 'utf8');
          if (envContent.includes('GROQ_API_KEY=')) {
            envContent = envContent.replace(/GROQ_API_KEY=.*/g, `GROQ_API_KEY=${apiKey}`);
          } else {
            envContent += `\nGROQ_API_KEY=${apiKey}\n`;
          }
        } else {
          envContent = `GROQ_API_KEY=${apiKey}\n`;
        }
        await fs.writeFile(ENV_FILE, envContent);
        console.log(chalk.green('✓ API key saved to .env file'));
      } catch (error) {
        console.error(chalk.red('Error saving to .env:'), error.message);
      }
    }

    await this.save();
  }

  getApiKey() {
    return this.config.apiKey || process.env.GROQ_API_KEY;
  }

  async setDefaultModel(modelId) {
    this.config.defaultModel = modelId;
    await this.save();
  }

  getDefaultModel() {
    return this.config.defaultModel;
  }

  async setAgentMode(mode) {
    if (!['plan', 'build'].includes(mode)) {
      throw new Error('Invalid agent mode. Must be "plan" or "build"');
    }
    this.config.agentMode = mode;
    await this.save();
  }

  getAgentMode() {
    return this.config.agentMode;
  }

  getConfig() {
    return { ...this.config, preferences: { ...this.config.preferences } };
  }

  getPreference(key) {
    return this.config.preferences?.[key];
  }

  async setPreference(key, value) {
    this.config.preferences = { ...this.config.preferences, [key]: value };
    await this.save();
  }

  async updatePreferences(preferences) {
    this.config.preferences = { ...this.config.preferences, ...preferences };
    await this.save();
  }

  isConfigured() {
    return !!(this.config.apiKey || process.env.GROQ_API_KEY);
  }

  async setWorkspaceRoot(workspaceRoot) {
    this.config.workspaceRoot = path.resolve(workspaceRoot);
    await this.save();
  }

  getWorkspaceRoot() {
    return this.config.workspaceRoot || process.cwd();
  }

  async exportConfig(targetPath) {
    await fs.writeJson(path.resolve(targetPath), this.getConfig(), { spaces: 2 });
  }

  async importConfig(sourcePath) {
    const imported = await fs.readJson(path.resolve(sourcePath));
    this.config = {
      ...DEFAULT_CONFIG,
      ...imported,
      preferences: {
        ...DEFAULT_CONFIG.preferences,
        ...(imported.preferences || {})
      }
    };
    await this.save();
  }

  static async createEnvExample(targetDir = process.cwd()) {
    const examplePath = path.join(targetDir, '.env.example');
    const content = `# Groq API Configuration\n# Get your API key from: https://console.groq.com/keys\nGROQ_API_KEY=your_api_key_here\n\n# Optional: Default model\n# GROQ_DEFAULT_MODEL=llama-3.3-70b-versatile\n`;
    await fs.writeFile(examplePath, content);
  }
}

export default ConfigManager;
