/**
 * Agent - Main orchestrator for the AI Agent
 */

import chalk from 'chalk';
import boxen from 'boxen';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import inquirer from 'inquirer';
import { FileManager } from './FileManager.js';
import { Planner } from './Planner.js';
import { GroqClient, AVAILABLE_MODELS } from '../llm/GroqClient.js';
import { ConfigManager } from '../utils/config.js';
import { CommandRunner } from './CommandRunner.js';

const execAsync = promisify(exec);

export class Agent {
  constructor(config = {}) {
    this.config = config;
    this.fileManager = new FileManager();
    this.configManager = new ConfigManager();
    this.groqClient = null;
    this.planner = null;
    this.commandRunner = new CommandRunner();
    this.mode = 'build';
  }

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

    const cfg = this.configManager.getConfig();
    this.fileManager.setOptions({
      workspaceRoot: cfg.workspaceRoot,
      allowOutsideWorkspace: cfg.preferences.allowOutsideWorkspace,
      maxUndoHistory: cfg.preferences.maxUndoHistory
    });
    this.commandRunner.setSafeMode(cfg.preferences.safeMode);

    return true;
  }

  async processInput(input) {
    const trimmed = input.trim();

    if (trimmed.startsWith('/')) {
      return this.handleSlashCommand(trimmed);
    }

    if (this.mode === 'build') {
      return this.handleBuildMode(trimmed);
    }

    if (this.mode === 'plan') {
      return this.handlePlanMode(trimmed);
    }

    return { success: false, message: 'Unknown agent mode' };
  }

  async handleSlashCommand(command) {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'models': return this.showModels();
      case 'model': return args[0] ? this.setModel(args[0]) : this.showCurrentModel();
      case 'agents':
      case 'mode': return args[0] ? this.setMode(args[0]) : this.showCurrentMode();
      case 'plan': return this.createPlan(args.join(' '));
      case 'execute': return this.executePlan(args[0] ? parseInt(args[0], 10) : null);
      case 'files': return this.listFiles(args[0] || '.', args.includes('--all'));
      case 'create': return this.handleCreateCommand(args);
      case 'read': return args[0] ? this.fileManager.readFile(args[0]) : { success: false, message: 'Usage: /read <file-path>' };
      case 'edit': return args.length >= 2 ? this.handleEditCommand(args) : { success: false, message: 'Usage: /edit <file-path> <mode> <args>' };
      case 'delete': return this.handleDeleteCommand(args[0]);
      case 'undo': return this.fileManager.undo();
      case 'redo': return this.fileManager.redo();
      case 'search': return this.searchInProject(args.join(' '));
      case 'open': return this.openFileAtLine(args[0]);
      case 'run': return this.runShellCommand(args.join(' '));
      case 'session': return this.handleSessionCommand(args);
      case 'prompt': return this.handlePromptCommand(args);
      case 'stream': return this.toggleBooleanPreference('streamResponses', args[0]);
      case 'preview': return this.toggleBooleanPreference('previewChanges', args[0]);
      case 'clear': this.groqClient.clearHistory(); return { success: true, message: 'Conversation history cleared' };
      case 'config': return this.handleConfigCommand(args);
      case 'help': return this.showHelp();
      case 'exit':
      case 'quit': return { success: true, exit: true };
      default: return { success: false, message: `Unknown command: /${cmd}` };
    }
  }

  async handleBuildMode(input) {
    const projectPrompt = await this.loadProjectPrompt();
    const systemPrompt = `${projectPrompt}\n\nYou are an expert coding assistant with file automation support. Use FILE blocks:\nFILE: path/to/file.ext\n\`\`\`language\ncontent\n\`\`\``;
    const cfg = this.configManager.getConfig();

    const call = cfg.preferences.streamResponses
      ? this.groqClient.sendMessageStream(input, { systemPrompt, maxRetries: cfg.preferences.maxRetries, baseDelayMs: cfg.preferences.retryBaseDelayMs }, (chunk) => process.stdout.write(chunk))
      : this.groqClient.sendMessage(input, { systemPrompt, maxRetries: cfg.preferences.maxRetries, baseDelayMs: cfg.preferences.retryBaseDelayMs });

    const response = await call;

    if (!response.success) return { success: false, error: response.error };

    if (cfg.preferences.streamResponses) process.stdout.write('\n');

    const fileBlocks = this.parseFileBlocks(response.content || '');
    if (fileBlocks.length === 0) return { success: true, content: response.content };

    console.log(chalk.cyan(`\n📁 Detected ${fileBlocks.length} file operation(s).`));

    if (cfg.preferences.previewChanges) {
      for (const block of fileBlocks) {
        console.log(chalk.gray(`- ${block.path} (${block.language})`));
      }
      const { proceed } = await inquirer.prompt([{ type: 'confirm', name: 'proceed', message: 'Apply these changes?', default: true }]);
      if (!proceed) return { success: true, message: 'Changes cancelled by user.', content: response.content };
    }

    for (const block of fileBlocks) {
      if (cfg.preferences.safeMode) {
        const { allow } = await inquirer.prompt([{ type: 'confirm', name: 'allow', message: `Write ${block.path}?`, default: true }]);
        if (!allow) continue;
      }
      await this.fileManager.createFile(block.path, block.content, { overwrite: true, showDiff: cfg.preferences.showDiff });
    }

    return { success: true, message: 'Files created/modified successfully', content: response.content, files: fileBlocks };
  }

  async handlePlanMode(input) {
    return this.createPlan(input);
  }

  parseFileBlocks(content) {
    const blocks = [];
    const regex = /FILE:\s*(.+?)\n```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({ path: match[1].trim(), language: match[2] || 'text', content: match[3].trim() });
    }
    return blocks;
  }

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

  async setModel(modelId) {
    try {
      this.groqClient.setModel(modelId);
      await this.configManager.setDefaultModel(modelId);
      return { success: true, message: `Model set to: ${modelId}` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  showCurrentModel() {
    const current = this.groqClient.getCurrentModel();
    console.log(chalk.cyan('\n🤖 Current Model:'));
    console.log(`  ID: ${current.id}`);
    console.log(`  Name: ${current.name}`);
    console.log(`  Max Tokens: ${current.maxTokens}\n`);
    return { success: true };
  }

  async setMode(mode) {
    if (!['plan', 'build'].includes(mode)) return { success: false, message: 'Mode must be "plan" or "build"' };
    this.mode = mode;
    await this.configManager.setAgentMode(mode);
    console.log(chalk.cyan(`\n${mode === 'plan' ? '📋' : '🔨'} Agent mode set to: ${mode.toUpperCase()}\n`));
    return { success: true };
  }

  showCurrentMode() {
    console.log(chalk.cyan(`\n${this.mode === 'plan' ? '📋' : '🔨'} Current Mode: ${this.mode.toUpperCase()}\n`));
    return { success: true };
  }

  async createPlan(task) {
    if (!task) return { success: false, message: 'Please provide a task description' };
    const plan = await this.planner.createPlan(task, { workingDir: process.cwd(), timestamp: new Date().toISOString() });
    console.log(chalk.cyan('\n📝 Plan Created:'));
    console.log(plan.content);
    console.log(chalk.gray(`\nPlan ID: ${plan.id}`));
    console.log(chalk.gray('Use /execute to run this plan\n'));
    return { success: true, plan };
  }

  async executePlan(planId) {
    if (!planId) {
      const plans = this.planner.getPlans();
      if (plans.length === 0) return { success: false, message: 'No plans available. Create one with /plan' };
      planId = plans[plans.length - 1].id;
    }

    const Executor = (await import('./Executor.js')).Executor;
    const executor = new Executor(this.groqClient);
    return this.planner.executePlan(planId, this.fileManager, executor);
  }

  async listFiles(dirPath, includeAll = false) {
    const result = await this.fileManager.listFiles(dirPath, { includeDirs: true, includeAll });
    if (result.success) {
      console.log(chalk.cyan(`\n📂 Contents of ${dirPath}:\n`));
      result.files.forEach((file) => console.log(`  ${file.isDirectory ? '📁' : '📄'} ${file.isDirectory ? chalk.blue(file.name) : chalk.white(file.name)}`));
      console.log('');
    }
    return result;
  }

  async handleCreateCommand(args) {
    if (args.length < 2) return { success: false, message: 'Usage: /create <file-path> <content>' };
    const cfg = this.configManager.getConfig();
    if (cfg.preferences.safeMode) {
      const { allow } = await inquirer.prompt([{ type: 'confirm', name: 'allow', message: `Create ${args[0]}?`, default: true }]);
      if (!allow) return { success: true, message: 'Create cancelled.' };
    }
    return this.fileManager.createFile(args[0], args.slice(1).join(' '), { showDiff: cfg.preferences.showDiff });
  }

  async handleDeleteCommand(filePath) {
    if (!filePath) return { success: false, message: 'Usage: /delete <file-path>' };
    const cfg = this.configManager.getConfig();
    if (cfg.preferences.safeMode) {
      const { allow } = await inquirer.prompt([{ type: 'confirm', name: 'allow', message: `Delete ${filePath}?`, default: false }]);
      if (!allow) return { success: true, message: 'Delete cancelled.' };
    }
    return this.fileManager.deleteFile(filePath);
  }

  async handleEditCommand(args) {
    const filePath = args[0];
    const mode = args[1];
    const cfg = this.configManager.getConfig();

    if (mode === 'replace' && args.length >= 3) return this.fileManager.editFile(filePath, { mode: 'replace', newContent: args.slice(2).join(' '), showDiff: cfg.preferences.showDiff });
    if (mode === 'find-replace' && args.length >= 4) return this.fileManager.editFile(filePath, { mode: 'find-replace', search: args[2], replace: args.slice(3).join(' '), showDiff: cfg.preferences.showDiff });
    if (mode === 'insert' && args.length >= 4) return this.fileManager.editFile(filePath, { mode: 'insert', line: parseInt(args[2], 10), newContent: args.slice(3).join(' '), showDiff: cfg.preferences.showDiff });
    if (mode === 'append' && args.length >= 3) return this.fileManager.editFile(filePath, { mode: 'append', newContent: args.slice(2).join(' '), showDiff: cfg.preferences.showDiff });

    return { success: false, message: 'Usage: /edit <path> replace|find-replace|insert|append <args>' };
  }

  async handleConfigCommand(args) {
    if (args.length === 0) {
      const config = this.configManager.getConfig();
      console.log(chalk.cyan('\n⚙️  Configuration:\n'));
      console.log(`  Default Model: ${config.defaultModel}`);
      console.log(`  Agent Mode: ${config.agentMode}`);
      console.log(`  Workspace Root: ${config.workspaceRoot}`);
      console.log(`  API Key: ${config.apiKey ? '✓ Configured' : '✗ Not configured'}`);
      console.log(`  Preferences: ${JSON.stringify(config.preferences)}\n`);
      return { success: true };
    }

    if (args[0] === 'apikey' && args[1]) {
      await this.configManager.setApiKey(args[1], true);
      this.groqClient = new GroqClient(args[1], this.configManager.getDefaultModel());
      return { success: true, message: 'API key configured' };
    }

    if (args[0] === 'export' && args[1]) {
      await this.configManager.exportConfig(args[1]);
      return { success: true, message: `Config exported to ${args[1]}` };
    }

    if (args[0] === 'import' && args[1]) {
      await this.configManager.importConfig(args[1]);
      return { success: true, message: `Config imported from ${args[1]}` };
    }

    if (args[0] === 'workspace' && args[1]) {
      await this.configManager.setWorkspaceRoot(args[1]);
      this.fileManager.setOptions({ workspaceRoot: args[1] });
      return { success: true, message: `Workspace set to ${path.resolve(args[1])}` };
    }

    if (args[0] === 'safemode' && ['on', 'off'].includes(args[1])) {
      return this.toggleBooleanPreference('safeMode', args[1]);
    }

    if (args[0] === 'showdiff' && ['on', 'off'].includes(args[1])) {
      return this.toggleBooleanPreference('showDiff', args[1]);
    }

    return { success: false, message: 'Usage: /config [apikey <key>|workspace <path>|safemode on|off|showdiff on|off|export <path>|import <path>]' };
  }

  async toggleBooleanPreference(key, valueArg) {
    if (!['on', 'off'].includes(valueArg)) {
      return { success: false, message: `Usage: /${key.replace('Responses', '')} on|off` };
    }
    const value = valueArg === 'on';
    await this.configManager.setPreference(key, value);
    if (key === 'safeMode') this.commandRunner.setSafeMode(value);
    return { success: true, message: `${key} set to ${value}` };
  }

  async searchInProject(pattern) {
    if (!pattern) return { success: false, message: 'Usage: /search <pattern>' };
    try {
      const { stdout } = await execAsync(`rg -n --hidden --glob '!.git' ${JSON.stringify(pattern)} .`);
      console.log(`\n${stdout}`);
      return { success: true, content: stdout };
    } catch (error) {
      if (error.stdout) {
        console.log(`\n${error.stdout}`);
        return { success: true, content: error.stdout };
      }
      return { success: false, message: error.message };
    }
  }

  async openFileAtLine(pointer) {
    if (!pointer) return { success: false, message: 'Usage: /open <path>:<line>' };
    const [filePath, lineRaw] = pointer.split(':');
    const line = parseInt(lineRaw, 10) || 1;
    const result = await this.fileManager.readFile(filePath);
    if (!result.success) return result;

    const lines = result.content.split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 2);
    const snippet = lines.slice(start, end).map((text, idx) => `${start + idx + 1}: ${text}`).join('\n');
    console.log(`\n${snippet}\n`);
    return { success: true, content: snippet };
  }

  async runShellCommand(command) {
    if (!command) return { success: false, message: 'Usage: /run <command>' };
    const cfg = this.configManager.getConfig();
    if (!cfg.preferences.allowShellExecution) {
      return { success: false, message: 'Shell execution is disabled. Enable by setting preferences.allowShellExecution.' };
    }

    if (cfg.preferences.safeMode) {
      const { allow } = await inquirer.prompt([{ type: 'confirm', name: 'allow', message: `Run command: ${command}?`, default: false }]);
      if (!allow) return { success: true, message: 'Command cancelled.' };
    }

    const result = await this.commandRunner.run(command);
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.log(chalk.yellow(result.stderr));
    return result;
  }

  async handleSessionCommand(args) {
    const sub = args[0];
    if (sub === 'save' && args[1]) {
      const filePath = await this.groqClient.saveHistory(args[1], { mode: this.mode });
      return { success: true, message: `Session saved: ${filePath}` };
    }
    if (sub === 'load' && args[1]) {
      await this.groqClient.loadHistory(args[1]);
      return { success: true, message: `Session loaded: ${args[1]}` };
    }
    if (sub === 'list') {
      const sessions = await this.groqClient.listSessions();
      console.log(`\n${sessions.join('\n')}\n`);
      return { success: true, sessions };
    }
    if (sub === 'delete' && args[1]) {
      await this.groqClient.deleteSession(args[1]);
      return { success: true, message: `Session deleted: ${args[1]}` };
    }
    return { success: false, message: 'Usage: /session save|load|list|delete <name>' };
  }

  async handlePromptCommand(args) {
    const promptPath = path.join(process.cwd(), '.ai-agent', 'prompt.md');
    const sub = args[0];
    if (sub === 'show') {
      const content = await fs.pathExists(promptPath) ? await fs.readFile(promptPath, 'utf8') : '(No project prompt configured)';
      console.log(`\n${content}\n`);
      return { success: true, content };
    }
    if (sub === 'reset') {
      await fs.remove(promptPath);
      return { success: true, message: 'Project prompt reset.' };
    }
    if (sub === 'edit') {
      const content = args.slice(1).join(' ');
      if (!content) return { success: false, message: 'Usage: /prompt edit <content>' };
      await fs.ensureDir(path.dirname(promptPath));
      await fs.writeFile(promptPath, content, 'utf8');
      return { success: true, message: 'Project prompt updated.' };
    }
    return { success: false, message: 'Usage: /prompt show|edit <text>|reset' };
  }

  async loadProjectPrompt() {
    const defaultPrompt = this.groqClient.getDefaultSystemPrompt();
    const promptPath = path.join(process.cwd(), '.ai-agent', 'prompt.md');
    if (await fs.pathExists(promptPath)) {
      const projectPrompt = await fs.readFile(promptPath, 'utf8');
      return `${defaultPrompt}\n\nProject-specific instructions:\n${projectPrompt}`;
    }
    return defaultPrompt;
  }

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
  /agents build        - Switch to build mode

${chalk.yellow('Planning:')}
  /plan <task>         - Create a plan for a task
  /execute [plan-id]   - Execute a plan

${chalk.yellow('File Operations:')}
  /files [path] [--all] - List files in directory
  /create <path> <content> - Create a file
  /read <path>         - Read file contents
  /edit <path> ...     - Edit a file
  /delete <path>       - Delete a file
  /undo | /redo        - Undo/redo last file change

${chalk.yellow('Productivity:')}
  /search <pattern>    - Search in project with ripgrep
  /open <path>:<line>  - Preview lines around target
  /run <command>       - Run shell command (if enabled)
  /session ...         - save/load/list/delete sessions
  /prompt ...          - show/edit/reset project prompt
  /stream on|off       - Toggle streaming responses
  /preview on|off      - Toggle preview before write

${chalk.yellow('Configuration:')}
  /config
  /config apikey <key>
  /config workspace <path>
  /config safemode on|off
  /config showdiff on|off
  /config export <path>
  /config import <path>

${chalk.yellow('Other:')}
  /clear
  /help
  /exit
`;
    console.log(helpText);
    return { success: true };
  }
}

export default Agent;
