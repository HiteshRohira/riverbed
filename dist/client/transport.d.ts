export declare function getQueryValue(name: string): unknown;
export declare function addQueryListener(name: string, listener: (value: unknown) => void): void;
export declare function removeQueryListener(name: string, listener: (value: unknown) => void): void;
export declare function send(message: Record<string, unknown>): void;
export declare function request(op: string, payload: Record<string, unknown>): Promise<unknown>;
export declare function connect(): WebSocket;
export declare function reconnect(): void;
//# sourceMappingURL=transport.d.ts.map