/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure message layer of the Chrome DevTools Protocol over a browser's
 * `--remote-debugging-pipe`: NUL-delimited JSON framing and the correlation
 * of requests with their responses. No Node and no `vscode` imports; the
 * process and the pipes live in `headless-export.mts`.
 */

/** Every message on the pipe ends with this character. */
export const messageDelimiter = '\0';

/** Serializes one protocol message for the pipe. */
export function encodeMessage(message: object): string {
    return `${JSON.stringify(message)}${messageDelimiter}`;
}

export interface FrameDecoder {
    /**
     * Feeds raw bytes from the pipe and returns every message that is now
     * complete. A message split across chunks, including inside a multi-byte
     * character, is returned once its delimiter arrives.
     */
    push(chunk: Uint8Array): string[];
}

/** Creates a decoder that splits the byte stream of the pipe into messages. */
export function createFrameDecoder(): FrameDecoder {
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    return {
        push(chunk: Uint8Array): string[] {
            pending += decoder.decode(chunk, { stream: true });
            const parts = pending.split(messageDelimiter);
            pending = parts.pop() ?? '';
            return parts.filter((part) => part.length > 0);
        },
    };
}

export interface CdpClient {
    /**
     * Sends a command and resolves with its `result`.
     * @param sessionId The attached target session; omit for browser-level commands.
     * @throws When the browser answers with an error or the client is closed.
     */
    send<T = unknown>(method: string, params?: object, sessionId?: string): Promise<T>;
    /** Feeds raw bytes read from the browser's output pipe. */
    receive(chunk: Uint8Array): void;
    /** Rejects every pending command and refuses new ones. Safe to call more than once. */
    close(reason: Error): void;
}

interface PendingCommand {
    method: string;
    resolve(result: unknown): void;
    reject(error: Error): void;
}

interface ProtocolResponse {
    id?: unknown;
    result?: unknown;
    error?: { message?: unknown };
}

/**
 * Creates a protocol client.
 * @param write Writes one encoded message to the browser's input pipe.
 */
export function createCdpClient(write: (text: string) => void): CdpClient {
    const decoder = createFrameDecoder();
    const pending = new Map<number, PendingCommand>();
    let nextId = 1;
    let closedBecause: Error | undefined;

    function handleMessage(text: string): void {
        let message: ProtocolResponse;
        try {
            message = JSON.parse(text) as ProtocolResponse;
        } catch {
            return;
        }
        if (typeof message !== 'object' || message === null || typeof message.id !== 'number') {
            // Events carry no id; nothing in the export flow listens to them.
            return;
        }
        const command = pending.get(message.id);
        if (!command) {
            return;
        }
        pending.delete(message.id);
        if (message.error) {
            const detail = typeof message.error.message === 'string' ? message.error.message : 'unknown error';
            command.reject(new Error(`${command.method}: ${detail}`));
            return;
        }
        command.resolve(message.result);
    }

    return {
        send<T = unknown>(method: string, params?: object, sessionId?: string): Promise<T> {
            if (closedBecause) {
                return Promise.reject(closedBecause);
            }
            const id = nextId++;
            return new Promise<T>((resolve, reject) => {
                pending.set(id, { method, resolve: resolve as (result: unknown) => void, reject });
                try {
                    write(encodeMessage({ id, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) }));
                } catch (error) {
                    pending.delete(id);
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
        },
        receive(chunk: Uint8Array): void {
            for (const text of decoder.push(chunk)) {
                handleMessage(text);
            }
        },
        close(reason: Error): void {
            if (closedBecause) {
                return;
            }
            closedBecause = reason;
            for (const command of pending.values()) {
                command.reject(reason);
            }
            pending.clear();
        },
    };
}
