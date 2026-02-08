/**
 * Executor - Executes individual plan steps
 */

import chalk from 'chalk';

export class Executor {
  constructor(groqClient) {
    this.groqClient = groqClient;
  }

  /**
   * Execute a single step
   */
  async executeStep(stepDescription, fileManager, context = {}) {
    console.log(chalk.gray(`  Processing: ${stepDescription}`));
    
    // Use LLM to interpret the step and determine actions
    const systemPrompt = `You are a task execution expert. Given a step from a plan, determine what actions to take.

Available file operations:
- CREATE file: { "action": "create", "path": "...", "content": "..." }
- READ file: { "action": "read", "path": "..." }
- EDIT file: { "action": "edit", "path": "...", "mode": "replace|insert|find-replace", "content": "..." }
- DELETE file: { "action": "delete", "path": "..." }

Respond with a JSON array of actions to execute:
[
  { "action": "create", "path": "src/index.js", "content": "console.log('hello');" }
]

If no file operations are needed, return: []`;

    try {
      const response = await this.groqClient.sendMessage(
        `Step: ${stepDescription}\n\nContext: ${JSON.stringify(context, null, 2)}`,
        { systemPrompt, temperature: 0.2 }
      );

      if (!response.success) {
        return { success: false, error: response.error };
      }

      // Parse actions from response
      const actions = this.parseActions(response.content);
      const results = [];

      for (const action of actions) {
        const result = await this.executeAction(action, fileManager);
        results.push(result);
        
        if (!result.success) {
          return { success: false, error: result.error, step: stepDescription };
        }
      }

      return { success: true, actions: results.length, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse actions from LLM response
   */
  parseActions(content) {
    try {
      // Try to extract JSON array
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.log(chalk.yellow('  Warning: Could not parse actions, continuing without file operations'));
      return [];
    }
  }

  /**
   * Execute a single action
   */
  async executeAction(action, fileManager) {
    switch (action.action) {
      case 'create':
        // Always overwrite in executor mode for smooth plan execution
        return await fileManager.createFile(action.path, action.content, { overwrite: true });
      
      case 'read':
        return await fileManager.readFile(action.path);
      
      case 'edit':
        return await fileManager.editFile(action.path, {
          mode: action.mode || 'replace',
          newContent: action.content,
          search: action.search
        });
      
      case 'delete':
        return await fileManager.deleteFile(action.path);
      
      default:
        return { success: false, error: `Unknown action: ${action.action}` };
    }
  }
}

export default Executor;
