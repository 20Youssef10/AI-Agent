/**
 * Agent - Main orchestrator for the AI Agent
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { FileManager } from './FileManager.js';
import { Planner } from './Planner.js';
import { GroqClient, AVAILABLE_MODELS } from '../llm/GroqClient.js';
import { ConfigManager } from '../utils/config.js';

export class Agent {
  constructor(config = {}) {
    this.config = config;
    this.fileManager = new FileManager();
    this.configManager = new ConfigManager();
    this.groqClient = null;
    this.planner = null;
    this.mode = 'build'; // 'plan' or 'build'
  }

  /**
   * Initialize the agent
   */
  async init() {
    await this.configManager.init();
    
    const apiKey = this.configManager.getApiKey();
    if (!apiKey) {
      console.log(boxen(
        chalk.yellow('⚠️  No API Key Configured\n\n') +
        'Please set your Groq API key:\n' +
        '1. Use /config apikey <your-key>\n' +
        '2. Or set GROQ_API_KEY environment variable\n' +
        '3. Or create a .env file with GROQ_API_KEY',
        { padding: 1, borderColor: 'yellow' }
      ));
      return false;
    }

    const model = this.configManager.getDefaultModel();
    this.groqClient = new GroqClient(apiKey, model);
    this.planner = new Planner(this.groqClient);
    this.mode = this.configManager.getAgentMode();

    return true;
  }

  /**
   * Process user input and execute commands
   */
  async processInput(input) {
    const trimmed = input.trim();
    
    // Handle slash commands
    if (trimmed.startsWith('/')) {
      return await this.handleSlashCommand(trimmed);
    }
    
    // Handle natural language in build mode
    if (this.mode === 'build') {
      return await this.handleBuildMode(trimmed);
    }
    
    // Handle planning mode
    if (this.mode === 'plan') {
      return await this.handlePlanMode(trimmed);
    }
  }

  /**
   * Handle slash commands
   */
  async handleSlashCommand(command) {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'models':
        return this.showModels();
      
      case 'model':
        if (args.length > 0) {
          return await this.setModel(args[0]);
        }
        return this.showCurrentModel();
      
      case 'agents':
      case 'mode':
        if (args.length > 0) {
          return await this.setMode(args[0]);
        }
        return this.showCurrentMode();
      
      case 'plan':
        return await this.createPlan(args.join(' '));
      
      case 'execute':
        const planId = args[0] ? parseInt(args[0]) : null;
        return await this.executePlan(planId);
      
      case 'files':
        return await this.listFiles(args[0] || '.');
      
      case 'create':
        if (args.length >= 2) {
          const filePath = args[0];
          const content = args.slice(1).join(' ');
          return await this.fileManager.createFile(filePath, content);
        }
        return { success: false, message: 'Usage: /create <file-path> <content>' };
      
      case 'read':
        if (args.length > 0) {
          return await this.fileManager.readFile(args[0]);
        }
        return { success: false, message: 'Usage: /read <file-path>' };
      
      case 'edit':
        if (args.length >= 2) {
          return await this.handleEditCommand(args);
        }
        return { success: false, message: 'Usage: /edit <file-path> <mode> <args>' };
      
      case 'delete':
        if (args.length > 0) {
          return await this.fileManager.deleteFile(args[0]);
        }
        return { success: false, message: 'Usage: /delete <file-path>' };
      
      case 'clear':
        this.groqClient.clearHistory();
        return { success: true, message: 'Conversation history cleared' };
      
      case 'config':
        return await this.handleConfigCommand(args);
      
      case 'help':
        return this.showHelp();
      
      case 'exit':
      case 'quit':
        return { success: true, exit: true };
      
      default:
        return { success: false, message: `Unknown command: /${cmd}` };
    }
  }

  /**
   * Handle build mode (natural language code generation)
   */
  async handleBuildMode(input) {
    const systemPrompt = `You are an expert coding assistant with the ability to directly manipulate files. The user wants to create or modify code.

Based on their request, you should:
1. Understand what they want to build
2. Generate the appropriate code
3. AUTOMATICALLY create or modify files using the FILE block format

When creating or modifying files, use this exact format:

FILE: path/to/file.js
\`\`\`javascript
// code here
\`\`\`

For modifying existing files:
- Read the file first if needed
- Use the FILE block with the complete updated content
- The file will be automatically overwritten

Examples:
- "Create a React component" → Output FILE block with the component code
- "Add a function to utils.js" → Output FILE block with the complete updated file
- "Fix the bug in server.js" → Output FILE block with the corrected code

Always provide complete, working code with proper error handling. The files will be created/modified automatically.`;

    const response = await this.groqClient.sendMessage(input, { systemPrompt });
    
    if (response.success) {
      // Check if response contains file creation instructions
      const fileBlocks = this.parseFileBlocks(response.content);
      if (fileBlocks.length > 0) {
        console.log(chalk.cyan('\n📁 Auto-executing file operations:\n'));
        
        // Automatically execute all file operations
        for (const block of fileBlocks) {
          const result = await this.fileManager.createFile(block.path, block.content, { overwrite: true });
          if (!result.success) {
            console.log(chalk.red(`  ✗ Failed to create/edit ${block.path}: ${result.error}`));
          }
        }
        
        return {
          success: true,
          message: 'Files created/modified successfully',
          content: response.content,
          files: fileBlocks
        };
      }
      
      return {
        success: true,
        content: response.content
      };
    }
    
    return { success: false, error: response.error };
  }

  /**
   * Handle plan mode
   */
  async handlePlanMode(input) {
    return await this.createPlan(input);
  }

  /**
   * Parse file blocks from response
   */
  parseFileBlocks(content) {
    const blocks = [];
    const regex = /FILE:\s*(.+?)\n```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        path: match[1].trim(),
        language: match[2] || 'text',
        content: match[3].trim()
      });
    }
    
    return blocks;
  }

  /**
   * Show available models
   */
  showModels() {
    console.log(chalk.cyan('\n🤖 Available Groq Models:\n'));
    
    Object.entries(AVAILABLE_MODELS).forEach(([id, info]) => {
      const recommended = info.recommended ? chalk.green(' ★ Recommended') : '';
      console.log(chalk.yellow(`${id}`));
      console.log(`  Name: ${info.name}`);
      console.log(`  Description: ${info.description}`);
      console.log(`  Max Tokens: ${info.maxTokens}${recommended}\n`);
    });
    
    return { success: true };
  }

  /**
   * Set the current model
   */
  async setModel(modelId) {
    try {
      this.groqClient.setModel(modelId);
      await this.configManager.setDefaultModel(modelId);
      return { success: true, message: `Model set to: ${modelId}` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Show current model
   */
  showCurrentModel() {
    const current = this.groqClient.getCurrentModel();
    console.log(chalk.cyan('\n🤖 Current Model:'));
    console.log(`  ID: ${current.id}`);
    console.log(`  Name: ${current.name}`);
    console.log(`  Max Tokens: ${current.maxTokens}\n`);
    return { success: true };
  }

  /**
   * Set agent mode
   */
  async setMode(mode) {
    if (!['plan', 'build'].includes(mode)) {
      return { success: false, message: 'Mode must be "plan" or "build"' };
    }
    
    this.mode = mode;
    await this.configManager.setAgentMode(mode);
    
    const emoji = mode === 'plan' ? '📋' : '🔨';
    console.log(chalk.cyan(`\n${emoji} Agent mode set to: ${mode.toUpperCase()}\n`));
    
    return { success: true };
  }

  /**
   * Show current mode
   */
  showCurrentMode() {
    const emoji = this.mode === 'plan' ? '📋' : '🔨';
    console.log(chalk.cyan(`\n${emoji} Current Mode: ${this.mode.toUpperCase()}\n`));
    return { success: true };
  }

  /**
   * Create a plan
   */
  async createPlan(task) {
    if (!task) {
      return { success: false, message: 'Please provide a task description' };
    }
    
    const plan = await this.planner.createPlan(task, {
      workingDir: process.cwd(),
      timestamp: new Date().toISOString()
    });
    
    console.log(chalk.cyan('\n📝 Plan Created:'));
    console.log(plan.content);
    console.log(chalk.gray(`\nPlan ID: ${plan.id}`));
    console.log(chalk.gray('Use /execute to run this plan\n'));
    
    return { success: true, plan };
  }

  /**
   * Execute a plan
   */
  async executePlan(planId) {
    if (!planId) {
      const plans = this.planner.getPlans();
      if (plans.length === 0) {
        return { success: false, message: 'No plans available. Create one with /plan' };
      }
      planId = plans[plans.length - 1].id;
    }
    
    // Create executor instance
    const Executor = (await import('./Executor.js')).Executor;
    const executor = new Executor(this.groqClient);
    
    return await this.planner.executePlan(planId, this.fileManager, executor);
  }

  /**
   * List files
   */
  async listFiles(dirPath) {
    const result = await this.fileManager.listFiles(dirPath, { includeDirs: true });
    
    if (result.success) {
      console.log(chalk.cyan(`\n📂 Contents of ${dirPath}:\n`));
      result.files.forEach(file => {
        const icon = file.isDirectory ? '📁' : '📄';
        const color = file.isDirectory ? chalk.blue : chalk.white;
        console.log(`  ${icon} ${color(file.name)}`);
      });
      console.log('');
    }
    
    return result;
  }

  /**
   * Handle edit command
   */
  async handleEditCommand(args) {
    const filePath = args[0];
    const mode = args[1];
    
    if (mode === 'replace' && args.length >= 3) {
      const content = args.slice(2).join(' ');
      return await this.fileManager.editFile(filePath, { mode: 'replace', newContent: content });
    } else if (mode === 'find-replace' && args.length >= 4) {
      // Usage: /edit <path> find-replace <search> <replace>
      const search = args[2];
      const replace = args.slice(3).join(' ');
      return await this.fileManager.editFile(filePath, { mode: 'find-replace', search, replace });
    } else if (mode === 'insert' && args.length >= 3) {
      // Usage: /edit <path> insert <line> <content>
      const line = parseInt(args[2]);
      const content = args.slice(3).join(' ');
      return await this.fileManager.editFile(filePath, { mode: 'insert', line, newContent: content });
    } else if (mode === 'append' && args.length >= 3) {
      // Usage: /edit <path> append <content>
      const content = args.slice(2).join(' ');
      return await this.fileManager.editFile(filePath, { mode: 'append', newContent: content });
    }
    
    return { success: false, message: 'Usage: /edit <path> replace|find-replace|insert|append <args>' };
  }

  /**
   * Handle config command
   */
  async handleConfigCommand(args) {
    if (args.length === 0) {
      const config = this.configManager.getConfig();
      console.log(chalk.cyan('\n⚙️  Configuration:\n'));
      console.log(`  Default Model: ${config.defaultModel}`);
      console.log(`  Agent Mode: ${config.agentMode}`);
      console.log(`  API Key: ${config.apiKey ? '✓ Configured' : '✗ Not configured'}\n`);
      return { success: true };
    }
    
    if (args[0] === 'apikey' && args[1]) {
      await this.configManager.setApiKey(args[1], true);
      this.groqClient = new GroqClient(args[1], this.configManager.getDefaultModel());
      return { success: true, message: 'API key configured' };
    }
    
    return { success: false, message: 'Usage: /config [apikey <key>]' };
  }

  /**
   * Show help
   */
  showHelp() {
    const helpText = `
${chalk.cyan('🤖 AI Agent - Available Commands')}

${chalk.yellow('Model Management:')}
  /models              - List available Groq models
  /model <id>          - Switch to a specific model
  /model               - Show current model

${chalk.yellow('Agent Modes:')}
  /agents              - Show current mode
  /agents plan         - Switch to planning mode
  /agents build        - Switch to build mode (auto-executes files)

${chalk.yellow('Planning:')}
  /plan <task>         - Create a plan for a task
  /execute [plan-id]   - Execute a plan (auto-executes files)

${chalk.yellow('File Operations:')}
  /files [path]        - List files in directory
  /create <path> <content> - Create a file
  /read <path>         - Read file contents
  /edit <path> replace <content>     - Replace entire file
  /edit <path> find-replace <search> <replace> - Replace text
  /edit <path> insert <line> <content> - Insert at line
  /edit <path> append <content>      - Append to file
  /delete <path>       - Delete a file

${chalk.yellow('Natural Language (Build Mode):')}
  Just describe what you want to build
  Example: "Create a React todo app"
  The agent will automatically create all necessary files!

${chalk.yellow('Other:')}
  /clear               - Clear conversation history
  /config              - Show configuration
  /config apikey <key> - Set API key
  /help                - Show this help
  /exit                - Exit the agent

${chalk.green('🚀 Auto-Execution Enabled: Files are created/modified automatically!')}
`;
    console.log(helpText);
    return { success: true };
  }
}

export default Agent;
