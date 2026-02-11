/**
 * FileManager - Handles all file operations for the AI Agent
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const DEFAULT_IGNORES = ['node_modules', '.git', 'dist', 'build'];

export class FileManager {
  constructor(options = {}) {
    this.operations = [];
    this.undoStack = [];
    this.redoStack = [];
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.allowOutsideWorkspace = !!options.allowOutsideWorkspace;
    this.maxUndoHistory = options.maxUndoHistory || 50;
  }

  setOptions(options = {}) {
    if (options.workspaceRoot) this.workspaceRoot = path.resolve(options.workspaceRoot);
    if (typeof options.allowOutsideWorkspace === 'boolean') this.allowOutsideWorkspace = options.allowOutsideWorkspace;
    if (typeof options.maxUndoHistory === 'number') this.maxUndoHistory = options.maxUndoHistory;
  }

  resolveWithinWorkspace(filePath) {
    const resolvedPath = path.resolve(filePath);
    const relative = path.relative(this.workspaceRoot, resolvedPath);
    if (!this.allowOutsideWorkspace && (relative.startsWith('..') || path.isAbsolute(relative))) {
      throw new Error(`Path is outside workspace root: ${filePath}`);
    }
    return resolvedPath;
  }

  pushHistory(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxUndoHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  computeSimpleDiff(oldText = '', newText = '') {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const max = Math.max(oldLines.length, newLines.length);
    const out = [];
    for (let i = 0; i < max; i += 1) {
      const a = oldLines[i];
      const b = newLines[i];
      if (a === b) continue;
      if (a !== undefined) out.push(chalk.red(`- ${a}`));
      if (b !== undefined) out.push(chalk.green(`+ ${b}`));
    }
    return out.join('\n');
  }

  async createFile(filePath, content, options = {}) {
    try {
      const resolvedPath = this.resolveWithinWorkspace(filePath);
      const dir = path.dirname(resolvedPath);
      await fs.ensureDir(dir);

      const exists = await fs.pathExists(resolvedPath);
      if (exists && !options.overwrite) {
        throw new Error(`File already exists: ${filePath}`);
      }

      const oldContent = exists ? await fs.readFile(resolvedPath, 'utf8') : null;
      if (options.showDiff && exists) {
        const diff = this.computeSimpleDiff(oldContent, content);
        if (diff) console.log(`\n${chalk.cyan('Diff preview:')}\n${diff}\n`);
      }

      await fs.writeFile(resolvedPath, content, 'utf8');
      this.operations.push({ type: exists ? 'overwrite' : 'create', path: filePath, timestamp: new Date() });
      this.pushHistory({ type: exists ? 'overwrite' : 'create', path: resolvedPath, oldContent, newContent: content });

      console.log(exists ? chalk.yellow(`✓ Overwritten: ${filePath}`) : chalk.green(`✓ Created: ${filePath}`));
      return { success: true, path: filePath, overwritten: exists };
    } catch (error) {
      console.error(chalk.red(`✗ Error creating file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async readFile(filePath) {
    try {
      const resolvedPath = this.resolveWithinWorkspace(filePath);
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const content = await fs.readFile(resolvedPath, 'utf8');
      return { success: true, content, path: filePath };
    } catch (error) {
      console.error(chalk.red(`✗ Error reading file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async editFile(filePath, options) {
    try {
      const resolvedPath = this.resolveWithinWorkspace(filePath);
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const oldContent = await fs.readFile(resolvedPath, 'utf8');
      let content = oldContent;

      if (options.mode === 'replace') {
        content = options.newContent;
      } else if (options.mode === 'insert') {
        const lines = content.split('\n');
        const position = Number.isInteger(options.line) ? options.line : lines.length;
        lines.splice(position, 0, options.newContent);
        content = lines.join('\n');
      } else if (options.mode === 'find-replace') {
        if (!content.includes(options.search)) {
          throw new Error(`Search pattern not found: ${options.search}`);
        }
        content = content.replaceAll(options.search, options.replace);
      } else if (options.mode === 'append') {
        content += `\n${options.newContent}`;
      }

      if (options.showDiff) {
        const diff = this.computeSimpleDiff(oldContent, content);
        if (diff) console.log(`\n${chalk.cyan('Diff preview:')}\n${diff}\n`);
      }

      await fs.writeFile(resolvedPath, content, 'utf8');
      this.operations.push({ type: 'edit', path: filePath, timestamp: new Date() });
      this.pushHistory({ type: 'edit', path: resolvedPath, oldContent, newContent: content });
      console.log(chalk.yellow(`✓ Edited: ${filePath}`));
      return { success: true, path: filePath };
    } catch (error) {
      console.error(chalk.red(`✗ Error editing file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async deleteFile(filePath) {
    try {
      const resolvedPath = this.resolveWithinWorkspace(filePath);
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const oldContent = await fs.readFile(resolvedPath, 'utf8');
      await fs.remove(resolvedPath);
      this.operations.push({ type: 'delete', path: filePath, timestamp: new Date() });
      this.pushHistory({ type: 'delete', path: resolvedPath, oldContent, newContent: null });
      console.log(chalk.red(`✓ Deleted: ${filePath}`));
      return { success: true, path: filePath };
    } catch (error) {
      console.error(chalk.red(`✗ Error deleting file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async listFiles(dirPath = '.', options = {}) {
    try {
      const resolvedPath = this.resolveWithinWorkspace(dirPath);
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const ignoreList = await this.loadIgnorePatterns();
      const items = await fs.readdir(resolvedPath, { withFileTypes: true });
      const files = items
        .filter((item) => {
          if (options.includeAll) return true;
          return !ignoreList.includes(item.name);
        })
        .filter((item) => options.includeDirs || !item.isDirectory())
        .map((item) => ({
          name: item.name,
          isDirectory: item.isDirectory(),
          path: path.join(dirPath, item.name)
        }));

      return { success: true, files, path: dirPath };
    } catch (error) {
      console.error(chalk.red(`✗ Error listing files: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async loadIgnorePatterns() {
    const patterns = [...DEFAULT_IGNORES];
    const ignorePath = path.join(this.workspaceRoot, '.ai-agentignore');
    if (await fs.pathExists(ignorePath)) {
      const lines = (await fs.readFile(ignorePath, 'utf8')).split('\n').map((x) => x.trim()).filter(Boolean);
      patterns.push(...lines);
    }
    return patterns;
  }

  async undo() {
    const op = this.undoStack.pop();
    if (!op) return { success: false, error: 'Nothing to undo' };

    try {
      if (op.oldContent === null) {
        await fs.remove(op.path);
      } else {
        await fs.ensureDir(path.dirname(op.path));
        await fs.writeFile(op.path, op.oldContent, 'utf8');
      }
      this.redoStack.push(op);
      return { success: true, message: `Undid ${op.type}: ${path.relative(this.workspaceRoot, op.path)}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async redo() {
    const op = this.redoStack.pop();
    if (!op) return { success: false, error: 'Nothing to redo' };

    try {
      if (op.newContent === null) {
        await fs.remove(op.path);
      } else {
        await fs.ensureDir(path.dirname(op.path));
        await fs.writeFile(op.path, op.newContent, 'utf8');
      }
      this.undoStack.push(op);
      return { success: true, message: `Redid ${op.type}: ${path.relative(this.workspaceRoot, op.path)}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getOperationHistory() {
    return this.operations;
  }

  clearHistory() {
    this.operations = [];
    this.undoStack = [];
    this.redoStack = [];
    console.log(chalk.gray('Operation history cleared'));
  }
}

export default FileManager;
