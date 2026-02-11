/**
 * GroqClient - Handles communication with Groq LLM API
 */

import Groq from 'groq-sdk';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.ai-agent', 'sessions');

export const AVAILABLE_MODELS = {
  'llama-3.3-70b-versatile': {
    name: 'Llama 3.3 70B',
    description: 'Most capable model for complex tasks',
    maxTokens: 32768,
    recommended: true
  },
  'llama-3.3-70b-specdec': {
    name: 'Llama 3.3 70B Speculative Decoding',
    description: 'Faster inference with speculative decoding',
    maxTokens: 8192
  },
  'llama-3.1-8b-instant': {
    name: 'Llama 3.1 8B Instant',
    description: 'Fast responses for simpler tasks',
    maxTokens: 8192
  },
  'mixtral-8x7b-32768': {
    name: 'Mixtral 8x7B',
    description: 'Strong performance with large context window',
    maxTokens: 32768
  },
  'gemma2-9b-it': {
    name: 'Gemma 2 9B',
    description: 'Efficient model for most coding tasks',
    maxTokens: 8192
  },
  'deepseek-r1-distill-llama-70b': {
    name: 'DeepSeek R1 Distill Llama 70B',
    description: 'Advanced reasoning capabilities',
    maxTokens: 16384
  },
  'qwen-2.5-32b': {
    name: 'Qwen 2.5 32B',
    description: 'Strong multilingual capabilities',
    maxTokens: 128000
  },
  'qwen-2.5-coder-32b': {
    name: 'Qwen 2.5 Coder 32B',
    description: 'Specialized for coding tasks',
    maxTokens: 128000,
    recommended: true
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GroqClient {
  constructor(apiKey, model = 'llama-3.3-70b-versatile') {
    if (!apiKey) throw new Error('Groq API key is required');
    this.client = new Groq({ apiKey });
    this.model = model;
    this.messageHistory = [];
  }

  setModel(modelId) {
    if (!AVAILABLE_MODELS[modelId]) throw new Error(`Unknown model: ${modelId}`);
    this.model = modelId;
    console.log(chalk.cyan(`Model switched to: ${AVAILABLE_MODELS[modelId].name}`));
  }

  getCurrentModel() {
    return {
      id: this.model,
      ...AVAILABLE_MODELS[this.model]
    };
  }

  async createCompletionWithRetry(payload, options = {}) {
    const maxRetries = options.maxRetries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 500;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.client.chat.completions.create(payload);
      } catch (error) {
        const status = error?.status || error?.response?.status;
        const transient = status === 429 || (status >= 500 && status < 600);
        if (!transient || attempt === maxRetries) throw error;
        const delay = baseDelayMs * (2 ** attempt);
        console.log(chalk.yellow(`Retrying request (${attempt + 1}/${maxRetries}) in ${delay}ms...`));
        await sleep(delay);
      }
    }
  }

  async sendMessage(content, options = {}) {
    const spinner = ora('Thinking...').start();

    try {
      const messages = [
        { role: 'system', content: options.systemPrompt || this.getDefaultSystemPrompt() },
        ...this.messageHistory,
        { role: 'user', content }
      ];

      const response = await this.createCompletionWithRetry({
        messages,
        model: this.model,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? AVAILABLE_MODELS[this.model]?.maxTokens ?? 4096,
        top_p: options.topP ?? 1,
        stream: false
      }, options);

      const assistantMessage = response.choices[0]?.message?.content;
      if (assistantMessage) {
        this.messageHistory.push({ role: 'user', content }, { role: 'assistant', content: assistantMessage });
        if (this.messageHistory.length > 20) this.messageHistory = this.messageHistory.slice(-20);
      }

      spinner.stop();
      return { success: true, content: assistantMessage, usage: response.usage };
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`API Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async sendMessageStream(content, options = {}, onChunk) {
    try {
      const messages = [
        { role: 'system', content: options.systemPrompt || this.getDefaultSystemPrompt() },
        ...this.messageHistory,
        { role: 'user', content }
      ];

      const stream = await this.client.chat.completions.create({
        messages,
        model: this.model,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? AVAILABLE_MODELS[this.model]?.maxTokens ?? 4096,
        top_p: options.topP ?? 1,
        stream: true
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || '';
        fullContent += chunkContent;
        if (onChunk) onChunk(chunkContent);
      }

      this.messageHistory.push({ role: 'user', content }, { role: 'assistant', content: fullContent });
      if (this.messageHistory.length > 20) this.messageHistory = this.messageHistory.slice(-20);

      return { success: true, content: fullContent };
    } catch (error) {
      console.error(chalk.red(`Streaming Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  async saveHistory(name, metadata = {}) {
    await fs.ensureDir(SESSIONS_DIR);
    const filePath = path.join(SESSIONS_DIR, `${name}.json`);
    await fs.writeJson(filePath, {
      name,
      savedAt: new Date().toISOString(),
      model: this.model,
      metadata,
      history: this.messageHistory
    }, { spaces: 2 });
    return filePath;
  }

  async loadHistory(name) {
    const filePath = path.join(SESSIONS_DIR, `${name}.json`);
    const session = await fs.readJson(filePath);
    this.model = session.model || this.model;
    this.messageHistory = session.history || [];
    return session;
  }

  async listSessions() {
    await fs.ensureDir(SESSIONS_DIR);
    const files = await fs.readdir(SESSIONS_DIR);
    return files.filter((file) => file.endsWith('.json')).map((file) => file.replace('.json', ''));
  }

  async deleteSession(name) {
    const filePath = path.join(SESSIONS_DIR, `${name}.json`);
    await fs.remove(filePath);
  }

  clearHistory() {
    this.messageHistory = [];
    console.log(chalk.gray('Conversation history cleared'));
  }

  getDefaultSystemPrompt() {
    return `You are a professional AI coding assistant with expertise in software engineering, architecture, and best practices.

Your capabilities include:
- Writing clean, efficient, and well-documented code
- Debugging and fixing errors
- Explaining complex concepts clearly
- Following best practices and design patterns
- Adapting to different coding styles and frameworks

When responding:
1. Provide complete, working solutions
2. Include comments explaining key logic
3. Suggest improvements when applicable
4. Use modern and idiomatic patterns
5. Consider edge cases and error handling

You can help with any programming language and framework.`;
  }

  static listModels() {
    return Object.entries(AVAILABLE_MODELS).map(([id, info]) => ({ id, ...info }));
  }
}

export default GroqClient;
