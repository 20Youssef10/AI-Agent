/**
 * FileManager - Handles all file operations for the AI Agent
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export class FileManager {
  constructor() {
    this.operations = [];
  }

  /**
   * Create a new file with content
   */
  async createFile(filePath, content, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      const dir = path.dirname(resolvedPath);
      
      // Ensure directory exists
      await fs.ensureDir(dir);
      
      // Check if file already exists
      const exists = await fs.pathExists(resolvedPath);
      if (exists && !options.overwrite) {
        throw new Error(`File already exists: ${filePath}`);
      }
      
      await fs.writeFile(resolvedPath, content, 'utf8');
      this.operations.push({ type: exists ? 'overwrite' : 'create', path: filePath, timestamp: new Date() });
      if (exists) {
        console.log(chalk.yellow(`✓ Overwritten: ${filePath}`));
      } else {
        console.log(chalk.green(`✓ Created: ${filePath}`));
      }
      return { success: true, path: filePath, overwritten: exists };
    } catch (error) {
      console.error(chalk.red(`✗ Error creating file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      
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

  /**
   * Edit file content (supports various modes)
   */
  async editFile(filePath, options) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      let content = await fs.readFile(resolvedPath, 'utf8');
      
      if (options.mode === 'replace') {
        content = options.newContent;
      } else if (options.mode === 'insert') {
        const lines = content.split('\n');
        const position = options.line || lines.length;
        lines.splice(position, 0, options.newContent);
        content = lines.join('\n');
      } else if (options.mode === 'find-replace') {
        if (!content.includes(options.search)) {
          throw new Error(`Search pattern not found: ${options.search}`);
        }
        content = content.replaceAll(options.search, options.replace);
      } else if (options.mode === 'append') {
        content += '\n' + options.newContent;
      }
      
      await fs.writeFile(resolvedPath, content, 'utf8');
      this.operations.push({ type: 'edit', path: filePath, timestamp: new Date() });
      console.log(chalk.yellow(`✓ Edited: ${filePath}`));
      return { success: true, path: filePath };
    } catch (error) {
      console.error(chalk.red(`✗ Error editing file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      await fs.remove(resolvedPath);
      this.operations.push({ type: 'delete', path: filePath, timestamp: new Date() });
      console.log(chalk.red(`✓ Deleted: ${filePath}`));
      return { success: true, path: filePath };
    } catch (error) {
      console.error(chalk.red(`✗ Error deleting file: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath = '.', options = {}) {
    try {
      const resolvedPath = path.resolve(dirPath);
      
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      
      const items = await fs.readdir(resolvedPath, { withFileTypes: true });
      const files = items
        .filter(item => options.includeDirs || !item.isDirectory())
        .map(item => ({
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

  /**
   * Create a directory
   */
  async createDirectory(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);
      await fs.ensureDir(resolvedPath);
      console.log(chalk.blue(`✓ Created directory: ${dirPath}`));
      return { success: true, path: dirPath };
    } catch (error) {
      console.error(chalk.red(`✗ Error creating directory: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file statistics
   */
  async getFileStats(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);
      return {
        success: true,
        stats: {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory()
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Search for files by pattern
   */
  async searchFiles(pattern, dirPath = '.') {
    try {
      const resolvedPath = path.resolve(dirPath);
      const results = [];
      
      const searchRecursive = async (currentPath) => {
        const items = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(currentPath, item.name);
          
          if (item.isDirectory()) {
            await searchRecursive(fullPath);
          } else if (item.name.match(pattern)) {
            results.push(fullPath);
          }
        }
      };
      
      await searchRecursive(resolvedPath);
      return { success: true, files: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get operation history
   */
  getOperationHistory() {
    return this.operations;
  }

  /**
   * Clear operation history
   */
  clearHistory() {
    this.operations = [];
    console.log(chalk.gray('Operation history cleared'));
  }
}

export default FileManager;
