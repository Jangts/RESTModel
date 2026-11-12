/** 维护检查的子进程执行器：固定 Node 环境、限定时长并收集诊断输出。 */
import { spawn } from 'node:child_process';
import { delimiter, dirname } from 'node:path';

/**
 * 在受支持的当前 Node 环境中运行命令；不经过 shell 插值。
 * @param {string} executable 可执行文件。
 * @param {string[]} args 原样传递的参数。
 * @param {{cwd?: string, timeout?: number}} options 工作目录及预算毫秒。
 * @returns {Promise<{stdout: string, stderr: string}>} 成功时的输出。
 * @throws {Error} 退出失败或超时；仅终止本次拥有的进程组。
 */
export function runCommand(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
      },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* 已退出的子进程无需再次终止。 */
      }
    }, options.timeout ?? 60000);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${executable}: ${timedOut ? 'timed out' : `exit ${code}`}\n${stdout}\n${stderr}`,
          ),
        );
    });
  });
}
