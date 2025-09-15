import { spawn } from 'child_process';
import { rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commandIdCounter = 0;

/**
 * A wrapper class for managing a node instance running as a child process for testing.
 */
export class TestNode {
    constructor(walletName, datastoreName) {
        this.walletName = walletName;
        this.datastorePath = path.join('/app/backend/data', datastoreName);
        this.child = null;
        this.address = null;
        this.peerId = null;
        this.isReady = false;
        this.pendingCommands = new Map();
    }

    /**
     * Spawns the child process and waits for it to be ready.
     */
    async start() {
        // Clean up old data
        await rm(this.datastorePath, { recursive: true, force: true });

        this.child = spawn('node', [
            '/app/backend/index.js',
            this.walletName,
            'null', // No bootstrap address, it will listen
            path.basename(this.datastorePath)
        ], {
            env: { ...process.env, NODE_ENV: 'test' }
        });

        this.child.stdout.on('data', (data) => {
            logger.info(`[${this.walletName}]: ${data.toString().trim()}`);
        });

        this.child.stderr.on('data', (data) => {
            logger.error(`[${this.walletName} ERROR]: ${data.toString().trim()}`);
        });

        this.child.on('message', (message) => {
            if (message.type === 'ready') {
                this.isReady = true;
                this.address = message.address;
            } else if (message.type === 'result' || message.type === 'error') {
                if (this.pendingCommands.has(message.id)) {
                    const { resolve, reject } = this.pendingCommands.get(message.id);
                    if (message.type === 'error') {
                        reject(new Error(message.message));
                    } else {
                        resolve(message.data);
                    }
                    this.pendingCommands.delete(message.id);
                }
            }
        });

        this.child.on('exit', (code) => {
            logger.warn(`[${this.walletName}] child process exited with code ${code}`);
            this.isReady = false;
        });

        // Wait for the node to be ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for ${this.walletName} to start`));
            }, 20000); // 20 second timeout

            const checkReady = () => {
                if (this.isReady) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }

    /**
     * Sends a command to the child process via IPC.
     * @param {string} command - The command name.
     * @param {object} data - The data to send with the command.
     * @returns {Promise<any>} - A promise that resolves with the result from the child.
     */
    sendCommand(command, data) {
        if (!this.child || !this.isReady) {
            return Promise.reject(new Error('Node is not running or not ready.'));
        }
        const id = commandIdCounter++;
        return new Promise((resolve, reject) => {
            this.pendingCommands.set(id, { resolve, reject });
            this.child.send({ id, command, data });
        });
    }

    /**
     * Stops the node process.
     */
    async stop() {
        if (this.child) {
            this.child.kill('SIGINT');
            await new Promise(resolve => this.child.on('exit', resolve));
            this.child = null;
            this.isReady = false;
        }
        // Final cleanup
        await rm(this.datastorePath, { recursive: true, force: true });
    }

    // --- Wrapper methods for IPC commands ---

    createTx(type, payload) {
        return this.sendCommand('create-tx', { type, payload });
    }

    getTx(cid) {
        return this.sendCommand('get-tx', { cid });
    }

    pin(cid) {
        return this.sendCommand('pin-cid', { cid });
    }

    getReputation(peerId) {
        return this.sendCommand('get-reputation', { peerId });
    }
}
