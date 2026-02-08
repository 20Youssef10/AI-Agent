#!/usr/bin/env node

/**
 * AI Agent CLI - Main entry point
 */

import { Agent } from './core/Agent.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager } from './utils/config.js';

const WELCOME_MESSAGE = boxen(
  chalk.cyan.bold('🤖 AI Agent') + '\n' +
  chalk.gray('Powered by Groq LLMs') + '\n\n' +
  chalk.white('Your intelligent coding assistant') + '\n' +
  chalk.gray('Type /help for available commands'),
  {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }
);

class CLI {
  constructor() {
    this.agent = new Agent();
    this.running = false;
  }

  async start() {
    console.log(WELCOME_MESSAGE);

    // Initialize agent
    const initialized = await this.agent.init();
    
    if (!initialized) {
      await this.setupWizard();
    }

    this.running = true;
    await this.runMainLoop();
  }

  async setupWizard() {
    console.log(chalk.yellow('\n⚙️  First-time Setup\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Groq API key:',
        validate: (input) => input.length > 0 || 'API key is required'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Choose your default model:',
        choices: [
          { name: 'Llama 3.3 70B (Recommended)', value: 'llama-3.3-70b-versatile' },
          { name: 'Qwen 2.5 Coder 32B (Best for code)', value: 'qwen-2.5-coder-32b' },
          { name: 'Mixtral 8x7B (Large context)', value: 'mixtral-8x7b-32768' },
          { name: 'Llama 3.1 8B (Fast)', value: 'llama-3.1-8b-instant' }
        ],
        default: 'llama-3.3-70b-versatile'
      },
      {
        type: 'list',
        name: 'mode',
        message: 'Choose default agent mode:',
        choices: [
          { name: 'Build Mode - Direct code generation', value: 'build' },
          { name: 'Plan Mode - Step-by-step planning', value: 'plan' }
        ],
        default: 'build'
      },
      {
        type: 'confirm',
        name: 'saveToEnv',
        message: 'Save API key to .env file?',
        default: true
      }
    ]);

    const config = new ConfigManager();
    await config.init();
    await config.setApiKey(answers.apiKey, answers.saveToEnv);
    await config.setDefaultModel(answers.model);
    await config.setAgentMode(answers.mode);

    // Re-initialize agent
    await this.agent.init();

    console.log(chalk.green('\n✓ Setup complete!\n'));
  }

  async runMainLoop() {
    while (this.running) {
      try {
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: this.getPrompt(),
            prefix: ''
          }
        ]);

        if (!input.trim()) continue;

        const result = await this.agent.processInput(input);

        if (result?.exit) {
          this.running = false;
          console.log(chalk.cyan('\n👋 Goodbye!\n'));
          continue;
        }

        if (result?.content) {
          console.log('\n' + result.content + '\n');
        }

        if (result?.message) {
          console.log(chalk.gray(result.message));
        }

        if (result?.error) {
          console.log(chalk.red('Error: ' + result.error));
        }

      } catch (error) {
        console.error(chalk.red('\n❌ Error: ' + error.message + '\n'));
      }
    }
  }

  getPrompt() {
    const mode = this.agent.mode || 'build';
    const model = this.agent.groqClient?.getCurrentModel().id || 'unknown';
    const modeEmoji = mode === 'plan' ? '📋' : '🔨';
    
    return chalk.cyan(`${modeEmoji} [${mode}] `) + 
           chalk.gray(`(${model.split('-').slice(0, 3).join('-')}...) `) +
           chalk.white('> ');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.cyan('\n\n👋 Goodbye!\n'));
  process.exit(0);
});

// Start CLI
const cli = new CLI();
cli.start().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

export default CLI;
