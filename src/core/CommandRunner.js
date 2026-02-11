/**
 * CommandRunner - Controlled shell execution
 */

import { exec } from 'child_process';

const DEFAULT_DENYLIST = [
  'rm -rf /',
  'mkfs',
  'shutdown',
  'reboot',
  ':(){ :|:& };:'
];

export class CommandRunner {
  constructor(options = {}) {
    this.safeMode = options.safeMode ?? true;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.denylist = options.denylist ?? DEFAULT_DENYLIST;
  }

  setSafeMode(safeMode) {
    this.safeMode = safeMode;
  }

  run(command) {
    if (this.safeMode && this.denylist.some((pattern) => command.includes(pattern))) {
      return Promise.resolve({ success: false, error: 'Command blocked by safe mode policy.' });
    }

    return new Promise((resolve) => {
      exec(command, { timeout: this.timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message, stdout, stderr });
          return;
        }
        resolve({ success: true, stdout, stderr });
      });
    });
  }
}

export default CommandRunner;
