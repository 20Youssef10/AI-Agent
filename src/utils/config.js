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

export class ConfigManager {
  constructor() {
    this.config = {
      apiKey: null,
      defaultModel: 'llama-3.3-70b-versatile',
      agentMode: 'build',
      lastWorkingDir: process.cwd(),
      preferences: {
        autoSave: true,
        confirmDestructive: true,
        theme: 'dark'
      }
    };
  }

  /**
   * Initialize configuration
   */
  async init() {
    // Ensure config directory exists
    await fs.ensureDir(CONFIG_DIR);
    
    // Load from config file if exists
    if (await fs.pathExists(CONFIG_FILE)) {
      try {
        const savedConfig = await fs.readJson(CONFIG_FILE);
        this.config = { ...this.config, ...savedConfig };
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load config file'));
      }
    }
    
    // Check environment variables (takes precedence)
    if (process.env.GROQ_API_KEY) {
      this.config.apiKey = process.env.GROQ_API_KEY;
    }
    
    // Check for .env file in current directory
    if (await fs.pathExists(ENV_FILE)) {
      const envContent = await fs.readFile(ENV_FILE, 'utf8');
      const envMatch = envContent.match(/GROQ_API_KEY=(.+)/);
      if (envMatch && !this.config.apiKey) {
        this.config.apiKey = envMatch[1].trim();
      }
    }
    
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save() {
    try {
      await fs.ensureDir(CONFIG_DIR);
      
      // Don't save API key to config file if it's from env
      const configToSave = { ...this.config };
      if (process.env.GROQ_API_KEY && configToSave.apiKey === process.env.GROQ_API_KEY) {
        delete configToSave.apiKey;
      }
      
      await fs.writeJson(CONFIG_FILE, configToSave, { spaces: 2 });
      return true;
    } catch (error) {
      console.error(chalk.red('Error saving config:', error.message));
      return false;
    }
  }

  /**
   * Set API key
   */
  async setApiKey(apiKey, saveToEnv = false) {
    this.config.apiKey = apiKey;
    
    if (saveToEnv) {
      // Save to .env file in current directory
      try {
        let envContent = '';
        if (await fs.pathExists(ENV_FILE)) {
          envContent = await fs.readFile(ENV_FILE, 'utf8');
          // Replace existing key or append
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
        console.error(chalk.red('Error saving to .env:', error.message));
      }
    }
    
    await this.save();
  }

  /**
   * Get API key
   */
  getApiKey() {
    return this.config.apiKey || process.env.GROQ_API_KEY;
  }

  /**
   * Set default model
   */
  async setDefaultModel(modelId) {
    this.config.defaultModel = modelId;
    await this.save();
  }

  /**
   * Get default model
   */
  getDefaultModel() {
    return this.config.defaultModel;
  }

  /**
   * Set agent mode (plan or build)
   */
  async setAgentMode(mode) {
    if (!['plan', 'build'].includes(mode)) {
      throw new Error('Invalid agent mode. Must be "plan" or "build"');
    }
    this.config.agentMode = mode;
    await this.save();
  }

  /**
   * Get agent mode
   */
  getAgentMode() {
    return this.config.agentMode;
  }

  /**
   * Get all configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update preferences
   */
  async updatePreferences(preferences) {
    this.config.preferences = { ...this.config.preferences, ...preferences };
    await this.save();
  }

  /**
   * Check if API key is configured
   */
  isConfigured() {
    return !!(this.config.apiKey || process.env.GROQ_API_KEY);
  }

  /**
   * Create .env.example file
   */
  static async createEnvExample(targetDir = process.cwd()) {
    const examplePath = path.join(targetDir, '.env.example');
    const content = `# Groq API Configuration
# Get your API key from: https://console.groq.com/keys
GROQ_API_KEY=your_api_key_here

# Optional: Default model
# GROQ_DEFAULT_MODEL=llama-3.3-70b-versatile
`;
    await fs.writeFile(examplePath, content);
  }
}

export default ConfigManager;
